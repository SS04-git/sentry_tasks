'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

type SyncedRepo = {
  owner: string;
  name: string;
  full_name: string;
  language?: string;
  private: boolean;
};

type RiskFile = {
  file: string;
  risk_score: number;
  churn: number;
  complexity: number;
  authors: number;
  change_frequency: number;
  bug_history: number;
};

type Metrics = {
  roc_auc?: number | null;
  precision?: number | null;
  recall?: number | null;
};

// ── Small components ───────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const [color, label] =
    score > 0.7 ? ['#ef4444', 'High']
    : score > 0.4 ? ['#f59e0b', 'Med']
    : ['#10b981', 'Low'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{
        display: 'inline-block', width: 8, height: 8,
        borderRadius: '50%', background: color, flexShrink: 0,
      }} />
      <span style={{ fontWeight: 700, color }}>{score.toFixed(2)}</span>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value?: number | null }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
        {value != null ? value.toFixed(2) : '—'}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '0.65rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.85rem',
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function DefectRiskPage() {
  const [repos, setRepos]       = useState<SyncedRepo[]>([]);
  const [selected, setSelected] = useState('');
  const [data, setData]         = useState<RiskFile[]>([]);
  const [metrics, setMetrics]   = useState<Metrics | null>(null);
  const [repoName, setRepoName] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Load synced repos for the picker
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchWithAuth('api/v1/github/repos', token)
      .then((res: any) => setRepos(res.data || []))
      .catch(() => {});
  }, []);

  const loadRisk = async (fullName: string) => {
    if (!fullName) return;
    const [owner, repo] = fullName.split('/');
    setLoading(true);
    setError(null);
    setData([]);
    setMetrics(null);
    setRepoName(fullName);

    try {
      const token = getToken();
      const res: any = await fetchWithAuth(
        `api/v1/defect_risk?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        token!,
      );
      setData(res.data || []);
      setMetrics(res.metrics || null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load risk data');
    } finally {
      setLoading(false);
    }
  };

  const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelected(val);
    loadRisk(val);
  };

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav active="admin" />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            <a href="/admin" style={{ textDecoration: 'none', color: 'var(--text-muted)' }}>Admin</a>
            <i className="fa-solid fa-chevron-right" />
            <span style={{ fontWeight: 600 }}>Defect Risk Watchlist</span>
          </div>

          {/* Header */}
          <div className="page-header">
            <h1>Defect Risk Watchlist</h1>
            <p>Files ranked by predicted defect probability — gradient-boosted ML model trained on your commit history</p>
          </div>

          {/* Repo picker */}
          <div className="card card-static" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              Repository
            </label>
            {repos.length === 0 ? (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                No synced repos found.{' '}
                <a href="/repositories" style={{ color: 'var(--accent)' }}>Connect &amp; sync a repo first →</a>
              </span>
            ) : (
              <select
                value={selected}
                onChange={handleRepoChange}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  minWidth: '260px',
                  cursor: 'pointer',
                }}
              >
                <option value="">— select a repository —</option>
                {repos.map(r => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.full_name}{r.language ? ` · ${r.language}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Model metrics */}
          {metrics && (
            <div className="card card-static" style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Model Performance
              </div>
              <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
                <MetricCard label="ROC-AUC"   value={metrics.roc_auc} />
                <MetricCard label="Precision" value={metrics.precision} />
                <MetricCard label="Recall"    value={metrics.recall} />
              </div>
              {metrics.roc_auc == null && (
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Metrics unavailable — the test split contains only one class. Sync more commit history to improve coverage.
                </p>
              )}
            </div>
          )}

          {/* Table */}
          {!selected && !loading && (
            <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
              Select a repository above to generate its risk watchlist.
            </div>
          )}

          {loading && (
            <div className="card" style={{ color: 'var(--text-muted)' }}>
              Mining commit history and building risk model…
            </div>
          )}

          {error && !loading && (
            <div className="card" style={{ color: '#ef4444' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && !error && data.length > 0 && (
            <div className="card card-static" style={{ padding: 0, overflowX: 'auto' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                <h2 style={{ margin: 0 }}>Ranked Risk Files</h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {repoName} · {data.length} file{data.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ minWidth: '860px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={TH}>#</th>
                      <th style={TH}>File</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Risk Score</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Churn</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Complexity</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Authors</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Change Freq</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Bug Commits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((f, i) => (
                      <tr
                        key={f.file}
                        style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle, rgba(0,0,0,0.02))' }}
                      >
                        <td style={{ ...TD, color: 'var(--text-muted)', width: '2rem' }}>{i + 1}</td>
                        <td style={{ ...TD, fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{f.file}</td>
                        <td style={{ ...TD, textAlign: 'center' }}><RiskBadge score={f.risk_score} /></td>
                        <td style={{ ...TD, textAlign: 'center' }}>{f.churn.toLocaleString()}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>{f.complexity}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>{f.authors}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>{f.change_frequency}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: f.bug_history > 0 ? '#f59e0b' : 'inherit', fontWeight: f.bug_history > 0 ? 600 : 400 }}>
                            {f.bug_history}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}