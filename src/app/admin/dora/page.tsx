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
  fontSize: '0.75rem',
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
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSync = async () => {
    setUrlError('');
    const parsed = parseGitHubUrl(urlInput);
    if (!parsed) {
      setUrlError('Could not parse a GitHub owner/repo from that input.');
      return;
    }

    const token = getToken();
    if (!token) { setUrlError('Please login again.'); return; }

    setSyncStatus('syncing');
    setOwner(parsed.owner);
    setRepo(parsed.repo);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

      await fetch(
        `${apiBase}/api/v1/github/repos/${parsed.owner}/${parsed.repo}/sync`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );

      // Poll sync-status every 5s for up to 2 minutes
      let synced = false;
      for (let i = 0; i < 24; i++) {
        await new Promise(res => setTimeout(res, 5000));
        const statusRes = await fetch(
          `${apiBase}/api/v1/github/sync-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const status = await statusRes.json();
        const repoStatus = status.repos?.find(
          (r: { repo: string; status: string }) =>
            r.repo === `${parsed.owner}/${parsed.repo}`
        );
        if (repoStatus?.status === 'success') { synced = true; break; }
        if (repoStatus?.status === 'error') {
          throw new Error(repoStatus.error ?? 'Sync failed on the server.');
        }
      }

      if (!synced) {
        throw new Error('Sync timed out — try clicking Sync again in a moment.');
      }

      setSyncStatus('synced');

    } catch (err: any) {
      setUrlError(err?.message ?? 'Sync failed. Check the repo name and try again.');
      setSyncStatus('error');
      setOwner('');
      setRepo('');
    }
  };

  const handleLoadMetrics = async () => {
    const parsed = parseGitHubUrl(urlInput);
    if (!parsed) return;
    await loadDashboard(parsed.owner, parsed.repo);
  };

  const handleReset = () => {
    setOwner(''); setRepo(''); setSelectedFull(''); setUrlInput(''); setUrlError('');
    setSyncStatus('idle');
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
    padding: '0.6rem 1.25rem',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent, #6366f1)' : 'var(--text-muted)',
    fontSize: '0.85rem',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav active="admin" />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            <a href="/admin" style={{ textDecoration: 'none', color: 'var(--text-muted)' }}>Admin</a>
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
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
                <button style={tabBtnStyle(tab === 'dropdown')} onClick={() => setTab('dropdown')}>
                  <i className="fa-solid fa-list" style={{ marginRight: '0.4rem' }} />
                  Connected Repos
                </button>
                <button style={tabBtnStyle(tab === 'url')} onClick={() => setTab('url')}>
                  <i className="fa-brands fa-github" style={{ marginRight: '0.4rem' }} />
                  GitHub URL
                </button>
              </div>

              <div style={{ padding: '1.5rem' }}>

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
                      Paste any public GitHub URL. Sync it first, then load metrics.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <input
                        style={inputStyle}
                        value={urlInput}
                        onChange={e => { setUrlInput(e.target.value); setUrlError(''); setSyncStatus('idle'); }}
                        onKeyDown={e => e.key === 'Enter' && syncStatus !== 'synced' && handleSync()}
                      />
                      <button
                        className="btn btn-primary"
                        disabled={!urlInput.trim() || syncStatus === 'syncing'}
                        onClick={handleSync}
                        style={{
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          opacity: syncStatus === 'synced' ? 0.5 : 1,
                        }}
                      >
                        {syncStatus === 'syncing'
                          ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.4rem' }} />Syncing…</>
                          : <><i className="fa-solid fa-rotate-right" style={{ marginRight: '0.4rem' }} />Sync</>}
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={syncStatus !== 'synced' || loading}
                        onClick={handleLoadMetrics}
                        style={{
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          opacity: syncStatus === 'synced' ? 1 : 0.5,
                        }}
                      >
                        {loading
                          ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.4rem' }} />Loading…</>
                          : 'Load Metrics'}
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
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }} />
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
                <div className="card card-static" style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <i className="fa-solid fa-spinner fa-spin icon-cyan" style={{ fontSize: '1.2rem', flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>Loading metrics…</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                      Reading DORA metrics for this repository.
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="card card-static" style={{ padding: '2rem', color: '#ef4444' }}>
                  {error}
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                    <KpiCard icon="fa-solid fa-rocket"         label="Deployment Frequency"  value={deploymentFrequency?.value ?? null} unit="/ wk" />
                    <KpiCard icon="fa-solid fa-hourglass-half" label="Lead Time for Change"   value={leadTime?.value ?? null}            unit="hrs" />
                    <KpiCard icon="fa-solid fa-triangle-exclamation" label="Change Failure Rate" value={failureRate?.value ?? null}      unit="%" />
                    <KpiCard icon="fa-solid fa-rotate-left"    label="Time to Restore"        value={restoreTime?.value ?? null}         unit="hrs" />
                    <KpiCard icon="fa-solid fa-code-pull-request" label="PR Review Latency"  value={reviewLatency?.value ?? null}       unit="hrs" />
                  </div>

                  {/* Summary table */}
                  <div className="card card-static" style={{ padding: 0, marginBottom: '2rem' }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                      <h2 style={{ margin: 0 }}>DORA Performance Summary</h2>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={TH}>Metric</th>
                          <th style={{ ...TH, textAlign: 'right' }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Deployment Frequency',  value: `${deploymentFrequency?.value ?? 0} / wk` },
                          { label: 'Lead Time for Change',  value: `${leadTime?.value ?? 0} hrs` },
                          { label: 'Change Failure Rate',   value: `${failureRate?.value ?? 0}%` },
                          { label: 'Time to Restore',       value: `${restoreTime?.value ?? 0} hrs` },
                          { label: 'PR Review Latency',     value: `${reviewLatency?.value ?? 0} hrs` },
                        ].map((row, i) => (
                          <tr key={row.label} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle, rgba(0,0,0,0.02))' }}>
                            <td style={TD}>{row.label}</td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
            <PageNav active="admin" />
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