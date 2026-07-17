'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import PageNav from '@/app/components/PageNav';

function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s.]+?)(?:\.git)?\/?$/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

const MAX_POLL_ATTEMPTS = 24; // 24 * 5s = 2 minutes
const POLL_INTERVAL_MS = 5000;

function GithubSyncPageContent() {
  const { user } = useAuth();
  const role = user?.role ?? 'employee';
  const router = useRouter();
  const searchParams = useSearchParams();

  const [syncData, setSyncData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // ── Add-repository state ──────────────────────────────────────────────
  const [addInput, setAddInput] = useState('');
  const [addError, setAddError] = useState('');
  const [addStatus, setAddStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [addedRepo, setAddedRepo] = useState<{ owner: string; repo: string } | null>(null);
  const requestGen = useRef(0);

  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/github/sync-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSyncData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Pre-fill the add-repo box if arriving with ?owner=&repo= (e.g. linked from DORA)
  useEffect(() => {
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    if (owner && repo) {
      setAddInput(`${owner}/${repo}`);
    }
  }, [searchParams]);

  const triggerSync = async (repo: string) => {
    const [owner, name] = repo.split('/');
    setSyncing(repo);

    try {
      const token = localStorage.getItem('token');
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/github/repos/${owner}/${name}/sync`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );

      setTimeout(() => {
        fetchStatus();
        setSyncing(null);
      }, 3000);
    } catch (err) {
      console.error(err);
      setSyncing(null);
    }
  };

  // ── Add & sync a repository that isn't in the list yet ──────────────────
  const handleAddRepo = async () => {
    setAddError('');
    const parsed = parseGitHubUrl(addInput);
    if (!parsed) {
      setAddError('Could not parse a GitHub owner/repo from that input. Try "owner/repo" or a full GitHub URL.');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) { setAddError('Please login again.'); return; }

    const myGen = ++requestGen.current;
    setAddStatus('syncing');
    setAddedRepo(parsed);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

      const triggerRes = await fetch(
        `${apiBase}/api/v1/github/repos/${parsed.owner}/${parsed.repo}/sync`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!triggerRes.ok) {
        throw new Error(`Could not start sync (status ${triggerRes.status}). Check the repo name.`);
      }

      let synced = false;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
        if (requestGen.current !== myGen) return;

        const statusRes = await fetch(
          `${apiBase}/api/v1/github/sync-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!statusRes.ok) continue;

        const status = await statusRes.json();
        setSyncData(status); // keep the main list live-updating too
        const repoStatus = status.repos?.find(
          (r: { repo: string; status: string }) => r.repo === `${parsed.owner}/${parsed.repo}`
        );
        if (repoStatus?.status === 'success') { synced = true; break; }
        if (repoStatus?.status === 'error') {
          throw new Error(repoStatus.error ?? 'Sync failed on the server.');
        }
      }

      if (requestGen.current !== myGen) return;

      if (!synced) {
        throw new Error('Sync timed out — try clicking Sync again in a moment.');
      }

      setAddStatus('synced');
      fetchStatus();

    } catch (err: any) {
      if (requestGen.current !== myGen) return;
      setAddError(err?.message ?? 'Sync failed. Check the repo name and try again.');
      setAddStatus('error');
    }
  };

  const goToDora = () => {
    if (!addedRepo) return;
    router.push(`/admin/dora?owner=${encodeURIComponent(addedRepo.owner)}&repo=${encodeURIComponent(addedRepo.repo)}`);
  };

  const statusColor = (status: string) => {
    if (status === 'success') return '#10b981';
    if (status === 'error') return '#f43f5e';
    if (status === 'running') return '#f59e0b';
    return '#94a3b8';
  };

  const statusIcon = (status: string) => {
    if (status === 'success') return 'fa-circle-check';
    if (status === 'error') return 'fa-circle-xmark';
    if (status === 'running') return 'fa-spinner fa-spin';
    return 'fa-circle-question';
  };

  const rateUsed = syncData?.rate_limit?.percent_used ?? 0;

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav active="admin" />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            <a href="/admin" style={{ textDecoration: 'none', color: 'var(--text-muted)' }}>Admin</a>
            <i className="fa-solid fa-chevron-right" />
            <span style={{ fontWeight: 600 }}>Github Sync</span>
          </div>

          {/* Header */}
          <div className="page-header">
            <h1>GitHub Sync</h1>
            <p>Monitor sync status and rate limit budget across all repositories</p>
          </div>

          {/* ── Add repository ── */}
          <div className="card card-static" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Add a repository</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Paste any public GitHub URL, or one you own privately, to sync it here. Once synced, it'll be available across Sentry — including on the DORA Metrics page.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={addInput}
                placeholder="owner/repo or https://github.com/owner/repo"
                aria-label="GitHub repository URL or owner/repo"
                onChange={e => { setAddInput(e.target.value); setAddError(''); setAddStatus('idle'); setAddedRepo(null); }}
                onKeyDown={e => e.key === 'Enter' && addStatus !== 'synced' && handleAddRepo()}
                style={{
                  flex: 1,
                  minWidth: '260px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                }}
              />
              <button
                disabled={!addInput.trim() || addStatus === 'syncing'}
                onClick={handleAddRepo}
                style={{ whiteSpace: 'nowrap' }}
              >
                {addStatus === 'syncing'
                  ? <><i className="fa-solid fa-spinner fa-spin icon-sm" style={{ marginRight: '0.4rem' }} />Syncing…</>
                  : <><i className="fa-solid fa-rotate-right icon-sm" style={{ marginRight: '0.4rem' }} />Sync</>}
              </button>
              {addStatus === 'synced' && addedRepo && (
                <button onClick={goToDora} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                  View DORA Metrics
                  <i className="fa-solid fa-arrow-right icon-sm" style={{ marginLeft: '0.4rem' }} />
                </button>
              )}
            </div>
            {addError && (
              <p style={{ fontSize: '0.82rem', color: '#ef4444', marginTop: '0.6rem', marginBottom: 0 }}>{addError}</p>
            )}
            {addStatus === 'synced' && !addError && (
              <p style={{ fontSize: '0.82rem', color: '#10b981', marginTop: '0.6rem', marginBottom: 0 }}>
                <i className="fa-solid fa-circle-check icon-sm" style={{ marginRight: '0.35rem' }} />
                Synced successfully.
              </p>
            )}
          </div>

          {/* Refresh button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={fetchStatus} style={{ padding: '0.5rem 1.25rem' }}>
              <i className="fa-solid fa-rotate-right icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Refresh
            </button>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="card card-static" style={{ padding: '2rem' }}>
              Loading sync status…
            </div>
          ) : syncData?.repos?.length === 0 ? (
            <div className="card card-static" style={{ padding: '2rem', textAlign: 'center' }}>
              No repos synced yet. Add one above to get started.
            </div>
          ) : (
            <div className="card card-static" style={{ padding: 0 }}>
              {syncData?.repos?.map((repo: any, i: number) => (
                <div
                  key={repo.repo}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1.25rem 1.5rem',
                    borderBottom:
                      i < syncData.repos.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <i
                    className={`fa-solid ${statusIcon(repo.status)}`}
                    style={{ color: statusColor(repo.status), fontSize: '1.1rem', flexShrink: 0 }}
                  />

                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600 }}>{repo.repo}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {repo.commits_synced} commits • {repo.prs_synced} PRs
                    </p>
                  </div>

                  {repo.status === 'success' && (
                    <a
                      href={`/admin/dora?owner=${encodeURIComponent(repo.repo.split('/')[0])}&repo=${encodeURIComponent(repo.repo.split('/')[1])}`}
                      className="btn-secondary"
                      style={{ fontSize: '0.8rem', textDecoration: 'none' }}
                    >
                      DORA Metrics
                    </a>
                  )}

                  <button
                    onClick={() => triggerSync(repo.repo)}
                    disabled={syncing === repo.repo}
                  >
                    {syncing === repo.repo ? 'Syncing…' : 'Sync'}
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function GithubSyncPage() {
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
      <GithubSyncPageContent />
    </Suspense>
  );
}