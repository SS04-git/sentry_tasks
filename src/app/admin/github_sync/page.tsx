'use client';

import { useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import PageNav from '@/app/components/PageNav';

export default function GithubSyncPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'employee';

  const [syncData, setSyncData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

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
              No repos synced yet.
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
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600 }}>{repo.repo}</p>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {repo.commits_synced} commits • {repo.prs_synced} PRs
                    </p>
                  </div>

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