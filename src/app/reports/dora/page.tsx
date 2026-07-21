'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { getToken } from '@/app/lib/auth';
import { getWithAuth } from '@/app/lib/api';
import { KpiCaveat } from '@/app/components/KpiCaveat';

// ── Types ──────────────────────────────────────────────────────────────────

type DoraMetric = { value: number; trend?: number };
type SZZResult = {
  fix_short_sha: string;
  fix_message: string;
  fix_author: string;
  affected_file: string;
  bug_short_sha: string;
  bug_message: string;
  bug_author: string;
  hours_from_bug_to_fix: number;
};
type GitRepo    = { owner: string; name: string; full_name: string };

function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s.]+?)(?:\.git)?\/?$/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

// ── Shared style tokens (match defect risk page) ───────────────────────────

const TH: React.CSSProperties = {
  padding: '0.65rem 1rem',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};
const TD: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.85rem',
};

// ── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, unit }: {
  icon: string; label: string; value: number | null; unit?: string;
}) {
  return (
    <div className="card stat-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <i className={icon} style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontWeight: 700, fontSize: '1.6rem', lineHeight: 1 }}>
        {value ?? 0}
        {unit && <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.25rem' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

function DoraPageContent() {
  const searchParams = useSearchParams();

  const [owner, setOwner] = useState(searchParams.get('owner') ?? '');
  const [repo,  setRepo]  = useState(searchParams.get('repo')  ?? '');

  const [tab,           setTab]           = useState<'dropdown' | 'url'>('dropdown');
  const [repoList,      setRepoList]      = useState<GitRepo[]>([]);
  const [reposLoading,  setReposLoading]  = useState(false);
  const [selectedFull,  setSelectedFull]  = useState('');
  const [urlInput,      setUrlInput]      = useState('');
  const [urlError,      setUrlError]      = useState('');

  const [loading,             setLoading]             = useState(false);
  const [deploymentFrequency, setDeploymentFrequency] = useState<DoraMetric | null>(null);
  const [leadTime,            setLeadTime]            = useState<DoraMetric | null>(null);
  const [failureRate,         setFailureRate]         = useState<DoraMetric | null>(null);
  const [restoreTime,         setRestoreTime]         = useState<DoraMetric | null>(null);
  const [reviewLatency,       setReviewLatency]       = useState<DoraMetric | null>(null);
  const [szzData,             setSzzData]             = useState<SZZResult[]>([]);
  const [error,               setError]               = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    setReposLoading(true);
    getWithAuth('api/v1/github/repos', token)
      .then((res) => {
        const list: GitRepo[] = Array.isArray(res) ? res : (res.data ?? []);
        setRepoList(list);
      })
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }, []);

  useEffect(() => {
    if (owner && repo) loadDashboard(owner, repo);
  }, []);

  const loadDashboard = async (ownerVal: string, repoVal: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      if (!token) { setError('Please login again'); return; }
      const qs = `owner=${encodeURIComponent(ownerVal)}&repo=${encodeURIComponent(repoVal)}`;
      const [, , , , reviewRes, szzRes, summaryRes] = await Promise.all([
        getWithAuth(`api/v1/dora/deployment-frequency?${qs}`, token),
        getWithAuth(`api/v1/dora/lead-time?${qs}`, token),
        getWithAuth(`api/v1/dora/change-failure-rate?${qs}`, token),
        getWithAuth(`api/v1/dora/time-to-restore?${qs}`, token),
        getWithAuth(`api/v1/dora/review-latency?${qs}`, token),
        getWithAuth(`api/v1/dora/szz-blame?${qs}`, token),
        getWithAuth(`api/v1/dora/kpi-summary?${qs}`, token),
      ]);
      console.log('szz raw:', JSON.stringify(szzRes));
      setDeploymentFrequency({ value: summaryRes.deployments_per_week ?? 0 });
      setLeadTime({ value: summaryRes.avg_lead_time_hours ?? 0 });
      setFailureRate({ value: summaryRes.change_failure_rate_pct ?? 0 });
      setRestoreTime({ value: summaryRes.avg_restore_hours ?? 0 });
      const latestReview = reviewRes.data?.length ? reviewRes.data[reviewRes.data.length - 1] : null;
      setReviewLatency({ value: latestReview?.avg_time_to_first_review_hours ?? 0 });
      setSzzData(szzRes.data || []);
    } catch (err) {
      setError('Failed to load DORA metrics');
    } finally {
      setLoading(false);
    }
  };

  const handleDropdownLoad = () => {
    const parsed = parseGitHubUrl(selectedFull);
    if (!parsed) return;
    setOwner(parsed.owner);
    setRepo(parsed.repo);
    loadDashboard(parsed.owner, parsed.repo);
  };

  const handleUrlLoad = () => {
    setUrlError('');
    const parsed = parseGitHubUrl(urlInput);
    if (!parsed) { setUrlError('Could not parse a GitHub owner/repo from that input.'); return; }
    setOwner(parsed.owner);
    setRepo(parsed.repo);
    loadDashboard(parsed.owner, parsed.repo);
  };

  const handleReset = () => {
    setOwner(''); setRepo(''); setSelectedFull(''); setUrlInput(''); setUrlError('');
  };

  const showPicker = !owner || !repo;

  // ── Shared input style ────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    minWidth: 0,
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.55rem 1.1rem',
    border: 'none',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
    borderRadius: '7px',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--accent, #6366f1)' : 'var(--text-muted)',
    opacity: active ? 1 : 0.65,
    fontSize: '0.85rem',
    transition: 'color 0.15s, opacity 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav active="reports" />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            <a href="/reports" style={{ textDecoration: 'none', color: 'var(--text-muted)' }}>Reports</a>
            <i className="fa-solid fa-chevron-right" />
            <span style={{ fontWeight: 600 }}>DORA Metrics</span>
          </div>

          {/* Header */}
          <div className="page-header">
            <h1>DORA Delivery Metrics</h1>
            <p>Track engineering delivery performance and defect origins.</p>
          </div>

          {/* ── Repo Picker ── */}
          {showPicker ? (
            <div className="card card-static" style={{ padding: 0 }}>

              {/* Tab strip */}
              <div style={{ display: 'flex', gap: '0.5rem', padding: '1.25rem 1.5rem 0' }}>
                <button className="tab-btn-reset" style={tabBtnStyle(tab === 'dropdown')} onClick={() => setTab('dropdown')} >
                  <i className="fa-solid fa-list" style={{ marginRight: '0.4rem' }} />
                  Connected Repos
                </button>
                <button className="tab-btn-reset" style={tabBtnStyle(tab === 'url')} onClick={() => setTab('url')} >
                  <i className="fa-brands fa-github" style={{ marginRight: '0.4rem' }} />
                  GitHub URL
                </button>
              </div>

              <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>

                {/* Dropdown tab */}
                {tab === 'dropdown' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Select a repository that has already been synced to Sentry.
                    </p>

                    {reposLoading ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading repositories…</p>
                    ) : repoList.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        No repositories found.{' '}
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--accent,#6366f1)', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
                          onClick={() => setTab('url')}
                        >
                          Try entering a URL instead.
                        </button>
                      </p>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <select
                          value={selectedFull}
                          onChange={e => setSelectedFull(e.target.value)}
                          style={inputStyle}
                        >
                          <option value="">— choose a repository —</option>
                          {repoList.map(r => (
                            <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary"
                          disabled={!selectedFull}
                          onClick={handleDropdownLoad}
                          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          Load Metrics
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* URL tab */}
                {tab === 'url' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Paste a GitHub URL or type <code>owner/repo</code>.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <input
                        style={inputStyle}
                        placeholder="https://github.com/"
                        value={urlInput}
                        onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
                      />
                      <button
                        className="btn btn-primary"
                        disabled={!urlInput.trim()}
                        onClick={handleUrlLoad}
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        Load Metrics
                      </button>
                    </div>
                    {urlError && (
                      <p style={{ fontSize: '0.82rem', color: '#ef4444', margin: 0 }}>{urlError}</p>
                    )}
                  </div>
                )}

              </div>
            </div>

          ) : (
            <>
              {/* Repo context bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <i className="fa-brands fa-github" />
                <a
                  href={`https://github.com/${owner}/${repo}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500 }}
                >
                  {owner} / {repo}
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginLeft: '0.35rem', fontSize: '12px' }} />
                </a>
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
                  onClick={handleReset}
                >
                  Change repo
                </button>
              </div>

              {loading ? (
                <div className="card card-static" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading DORA metrics…
                </div>
              ) : error ? (
                <div className="card card-static" style={{ padding: '2rem', color: '#ef4444' }}>
                  {error}
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div className="stats-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                    <KpiCard icon="fa-solid fa-rocket"         label="Deployment Frequency"  value={deploymentFrequency?.value ?? null} unit="/ wk" />
                    <KpiCard icon="fa-solid fa-hourglass-half" label="Lead Time for Change"   value={leadTime?.value ?? null}            unit="hrs" />
                    <KpiCard icon="fa-solid fa-triangle-exclamation" label="Change Failure Rate" value={failureRate?.value ?? null}      unit="%" />
                    <KpiCard icon="fa-solid fa-rotate-left"    label="Time to Restore"        value={restoreTime?.value ?? null}         unit="hrs" />
                    <KpiCard icon="fa-solid fa-code-pull-request" label="PR Review Latency"  value={reviewLatency?.value ?? null}       unit="hrs" />
                  </div>

                  {/* SZZ */}
                  <div className="card card-static" style={{ padding: 0 }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                      <h2 style={{ margin: 0 }}>Defect Origin Analysis (SZZ)</h2>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {szzData.length} result{szzData.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
  <tr>
    <th style={TH}>Fix Commit</th>
    <th style={TH}>Fix Message</th>
    <th style={TH}>Bug-Introducing Commit</th>
    <th style={TH}>Bug Message</th>
    <th style={TH}>Author</th>
    <th style={TH}>File</th>
  </tr>
</thead>
<tbody>
  {szzData.length === 0 ? (
    <tr>
      <td colSpan={6} style={{ ...TD, color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
        No defect origin data available for this repository.
      </td>
    </tr>
  ) : szzData.map((row, i) => (
    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle, rgba(0,0,0,0.02))' }}>
      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.fix_short_sha ?? '—'}</td>
      <td style={{ ...TD, fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.fix_message ?? '—'}
      </td>
      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.bug_short_sha ?? '—'}</td>
      <td style={{ ...TD, fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.bug_message ?? '—'}
      </td>
      <td style={TD}>{row.fix_author ?? '—'}</td>
      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.affected_file ?? '—'}</td>
    </tr>
  ))}
</tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Governance caveats ── */}
                  <div className="card card-static" style={{ padding: '1rem 1.5rem', marginTop: '1.5rem' }}>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text)' }}>
                      Metric notes
                    </p>
                    <KpiCaveat kpiKey="deployment_frequency" />
                    <KpiCaveat kpiKey="lead_time" />
                  </div>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function DoraPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRoute>
          <div className="page">
            <PageNav active="reports" />
            <div className="page-body">
              <p>Loading...</p>
            </div>
          </div>
        </ProtectedRoute>
      }
    >
      <DoraPageContent />
    </Suspense>
  );
}
