'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth, getWithAuth, postWithAuth } from '@/app/lib/api';
import PageNav from '@/app/components/PageNav';

/* ─────────────────────────────────────────────
   TYPES — shaped to match the actual DB views
   (v_cq_complexity_summary, v_cq_churn_summary,
   v_cq_complexity_trend, v_cq_secret_alerts_open,
   and the custom /lint query), not guesses.
──────────────────────────────────────────── */

type ComplexitySummary = {
  owner: string;
  repo: string;
  file_count: number;
  avg_complexity: number;
  max_complexity: number;
  high_complexity_files: number;
} | null;

type ChurnSummary = {
  owner: string;
  repo: string;
  total_lines_added: number;
  total_lines_removed: number;
  total_commits: number;
  high_churn_files: number;
} | null;

type TrendItem = {
  owner: string;
  repo: string;
  scan_date: string;
  avg_complexity: number;
  high_complexity_files: number;
  // Note: v_cq_complexity_trend has no churn column — there's no
  // churn-over-time data source yet, so it's intentionally left out
  // here rather than faked as 0.
};

type LintSummary = {
  owner: string;
  repo: string;
  total_findings: number;
  error_count: number;
  warning_count: number;
  findings_per_kloc: number | null;
};

type SecretAlert = {
  id: string;
  repo: string;
  tool: 'gitleaks' | 'semgrep';
  severity: string;
  file_path: string;
  line_number: number;
  status: string;
  created_at: string;
};

type RepoOption = {
  full_name: string;
  owner: string;
  name: string;
};

export default function CodeQualityPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';

  const [reposLoading, setReposLoading] = useState(true);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedFullName, setSelectedFullName] = useState('');

  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [complexity, setComplexity] = useState<ComplexitySummary>(null);
  const [churn, setChurn] = useState<ChurnSummary>(null);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [lint, setLint] = useState<LintSummary[]>([]);
  const [alerts, setAlerts] = useState<SecretAlert[]>([]);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const selected = repos.find((r) => r.full_name === selectedFullName) ?? null;

  /* ─────────────────────────────
     OUTSIDE CLICK (PROFILE)
  ───────────────────────────── */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ─────────────────────────────
     LOAD REPO LIST (for the dropdown)
  ───────────────────────────── */
  useEffect(() => {
    const loadRepos = async () => {
      try {
        const token = getToken();
        if (!token) return;

        const data = await getWithAuth('api/v1/github/repositories', token);

        const options: RepoOption[] = (Array.isArray(data) ? data : [])
          .map((r: any) => ({
            full_name: r.full_name,
            owner: r.owner?.login,
            name: r.name,
          }))
          .filter((r: RepoOption) => r.full_name && r.owner && r.name);

        setRepos(options);
      } catch (err) {
        console.error('Failed to load repositories:', err);
      } finally {
        setReposLoading(false);
      }
    };

    loadRepos();
  }, []);

  /* ─────────────────────────────
     LOAD SCAN DATA (whenever the selected repo changes)
  ───────────────────────────── */
  useEffect(() => {
  if (!selected) return;
  loadData(selected.owner, selected.name);
}, [selectedFullName]);

const loadData = async (owner: string, repo: string) => {
  setLoading(true);
  setScanError(null);

  try {
    const token = getToken();
    if (!token) {
      setScanError("No auth token found. Please login again.");
      return;
    }

    // Just read existing results — do NOT trigger a scan here
    const qs = `owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
    const [complexityRes, churnRes, lintRes, secretsRes, trendRes] = await Promise.all([
      getWithAuth(`api/v1/code_quality/complexity?${qs}`, token),
      getWithAuth(`api/v1/code_quality/churn?${qs}`, token),
      getWithAuth(`api/v1/code_quality/lint?${qs}`, token),
      getWithAuth(`api/v1/code_quality/secrets?${qs}`, token),
      getWithAuth(`api/v1/code_quality/trend?${qs}`, token),
    ]);

    setComplexity(complexityRes.data?.[0] ?? null);
    setChurn(churnRes.data?.[0] ?? null);
    setLint(lintRes.data || []);
    setAlerts(secretsRes.data || []);
    setTrend(trendRes.data || []);
  } catch (err) {
    console.error(err);
    setScanError(err instanceof Error ? err.message : 'Failed to load scan data');
  } finally {
    setLoading(false);
  }
};

const runScan = async (owner: string, repo: string) => {
  setLoading(true);
  setScanError(null);
  try {
    const token = getToken();
    const scanResult = await postWithAuth(`api/v1/code_quality/scan/${owner}/${repo}`, token!, {});
    if (scanResult.status === 'failed') {
      setScanError(scanResult.error || 'Scan failed');
      return;
    }
    await loadData(owner, repo); // refresh with new results
  } catch (err) {
    setScanError(err instanceof Error ? err.message : 'Scan failed');
  } finally {
    setLoading(false);
  }
};

  /* ─────────────────────────────
     ALERT ACTIONS
  ───────────────────────────── */
  const handleAlert = async (
    id: string,
    action: 'resolve' | 'dismiss'
  ) => {
    try {
      const token = getToken();

      await fetchWithAuth(
        `/api/v1/code_quality/secrets/${id}/${action}`,
        token!,
        { method: 'PATCH' }
      );

      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to update alert');
    }
  };

  /* ─────────────────────────────
     METRICS
  ───────────────────────────── */
  const avgComplexity = complexity?.avg_complexity?.toFixed(2) ?? '0';

  const avgChurn =
    churn && churn.total_commits > 0
      ? (
          (churn.total_lines_added + churn.total_lines_removed) /
          churn.total_commits
        ).toFixed(2)
      : '0';

  const totalHighLint = lint.reduce((s, r) => s + (r.error_count || 0), 0);

  const thStyle = {
    padding: '0.85rem 1.25rem',
    textAlign: 'center' as const,
    fontWeight: 600,
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)',
    background: 'rgba(6,182,212,0.04)',
  };

  const tdStyle = {
    padding: '0.85rem 1.25rem',
    textAlign: 'center' as const,
    borderBottom: '1px solid var(--border)',
  };

  /* ─────────────────────────────
     UI
  ───────────────────────────── */

  return (
    <ProtectedRoute>
      <div className="page">

        <PageNav active="admin" />

        {/* BODY */}
        <div className="page-body">

          {/* Breadcrumb */}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          fontSize: '0.82rem',
        }}
      >
        <a
          href="/admin"
          style={{
            textDecoration: 'none',
            color: 'var(--text-muted)',
          }}
        >
          Admin
        </a>

        <i className="fa-solid fa-chevron-right"></i>

        <span
          style={{
            fontWeight: 600,
          }}
        >
          Security
        </span>
      </div>

          {/* HEADER */}
          <div className="page-header">
            <h1>Code Quality Dashboard</h1>
            <p>
              Track complexity trends, churn, lint density, and security scan alerts.
            </p>
          </div>

          {/* REPO PICKER */}
          <div className="card card-static" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
            <label htmlFor="repo-select" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Repository
            </label>
            <select
              id="repo-select"
              value={selectedFullName}
              onChange={(e) => setSelectedFullName(e.target.value)}
              disabled={reposLoading || repos.length === 0}
              style={{
                width: '100%',
                maxWidth: '420px',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg, transparent)',
              }}
            >
              <option value="" disabled>
                {reposLoading
                  ? 'Loading repositories…'
                  : repos.length === 0
                  ? 'No synced repositories found'
                  : 'Select a repository'}
              </option>
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>

          {!selected ? (
            <div className="card card-static" style={{ padding: '2rem' }}>
              Select a repository above to run a code quality scan.
            </div>
          ) : loading ? (
            <div className="card card-static" style={{ padding: '2rem' }}>
              Scanning {selected.full_name}... this can take a minute.
            </div>
          ) : scanError ? (
            <div className="card card-static" style={{ padding: '2rem', color: 'var(--danger, #ef4444)' }}>
              Scan failed: {scanError}
            </div>
          ) : (
            <>

              {/* KPI CARDS */}
              <div className="stats-grid" style={{ marginBottom: '2rem' }}>

                <div className="card stat-card">
                  <p className="stat-label">Avg Complexity</p>
                  <p className="stat-value">{avgComplexity}</p>
                </div>

                <div className="card stat-card">
                  <p className="stat-label">Avg Lines Changed / Commit</p>
                  <p className="stat-value">{avgChurn}</p>
                </div>

                <div className="card stat-card">
                  <p className="stat-label">High Severity Lint</p>
                  <p className="stat-value">{totalHighLint}</p>
                </div>

                <div className="card stat-card">
                  <p className="stat-label">Open Alerts</p>
                  <p className="stat-value">{alerts.length}</p>
                </div>

              </div>

              {/* TREND TABLE */}
              <div className="card card-static" style={{ padding: 0, marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h2>Quality Trends</h2>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {/* <th style={thStyle}>Repo</th> */}
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Avg Complexity</th>
                      <th style={thStyle}>High Complexity Files</th>
                    </tr>
                  </thead>

                  <tbody>
                    {trend.map((t) => (
                      <tr key={t.repo + t.scan_date}>
                        {/* <td style={tdStyle}>{t.repo}</td> */}
                        <td style={tdStyle}>{t.scan_date}</td>
                        <td style={tdStyle}>{t.avg_complexity}</td>
                        <td style={tdStyle}>{t.high_complexity_files}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* LINT TABLE */}
              <div className="card card-static" style={{ padding: 0, marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h2>Lint Summary</h2>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Repo</th>
                      <th style={thStyle}>Density (per kLOC)</th>
                      <th style={thStyle}>Errors</th>
                      <th style={thStyle}>Warnings</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lint.map((l) => (
                      <tr key={l.repo}>
                        <td style={tdStyle}>{l.repo}</td>
                        <td style={tdStyle}>{l.findings_per_kloc ?? '—'}</td>
                        <td style={tdStyle}>{l.error_count}</td>
                        <td style={tdStyle}>{l.warning_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SECRET ALERT FEED */}
              <div className="card card-static" style={{ padding: 0 }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h2>Secret Scanning Alerts</h2>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Repo</th>
                      <th style={thStyle}>Tool</th>
                      <th style={thStyle}>Severity</th>
                      <th style={thStyle}>File</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id}>
                        <td style={tdStyle}>{a.repo}</td>
                        <td style={tdStyle}>{a.tool}</td>
                        <td style={tdStyle}>{a.severity}</td>
                        <td style={tdStyle}>
                          {a.file_path}:{a.line_number}
                        </td>

                        <td style={tdStyle}>
                          <button
                            className="btn-secondary"
                            onClick={() => handleAlert(a.id, 'resolve')}
                            style={{ marginLeft: '0.5rem' }}
                          >
                            Resolve
                          </button>

                          <button
                            className="btn-secondary"
                            onClick={() => handleAlert(a.id, 'dismiss')}
                            style={{ marginLeft: '0.5rem' }}
                          >
                            Dismiss
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}