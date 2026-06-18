'use client';

import { useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';

export default function GithubSyncPage() {
  const { user, logout } = useAuth();
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
      const res = await fetch('http://localhost:8000/api/v1/github/sync-status');
      const data = await res.json();
      setSyncData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const triggerSync = async (repo: string) => {
    const [owner, name] = repo.split('/');
    setSyncing(repo);
    try {
      await fetch(`http://localhost:8000/api/v1/github/repos/${owner}/${name}/sync`, {
        method: 'POST',
      });
      setTimeout(() => { fetchStatus(); setSyncing(null); }, 3000);
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
  const rateColor = rateUsed > 80 ? '#f43f5e' : rateUsed > 50 ? '#f59e0b' : '#10b981';

  return (
    <ProtectedRoute>
      <div className="page">
        <nav className="nav">
          <div className="nav-inner">
            <div className="nav-logo">
              <div className="nav-logo-icon">
                <i className="fa-solid fa-shield-halved icon-white icon-md"></i>
              </div>
              <span className="nav-logo-text">Sentry</span>
            </div>
            <div className="nav-links">
              <a href="/dashboard" className="nav-link">
                <i className="fa-solid fa-gauge icon-sm" style={{ marginRight: '0.4rem' }}></i>Dashboard
              </a>
              {['admin', 'leadership', 'manager'].includes(role) && (
                <a href="/reports" className="nav-link">
                  <i className="fa-solid fa-chart-bar icon-sm" style={{ marginRight: '0.4rem' }}></i>Reports
                </a>
              )}
              {['admin', 'leadership'].includes(role) && (
                <a href="/admin" className="nav-link active">
                  <i className="fa-solid fa-screwdriver-wrench icon-sm" style={{ marginRight: '0.4rem' }}></i>Admin
                </a>
              )}
            </div>
            <div className="nav-user">
              <div className="nav-notification">
                <i className="fa-solid fa-bell icon-cyan"></i>
              </div>
              <div className="profile-trigger" ref={profileRef} onClick={() => setProfileOpen(!profileOpen)}>
                <i className="fa-solid fa-circle-user icon-cyan"></i>
                {profileOpen && (
                  <div className="profile-dropdown">
                    <div className="profile-dropdown-header">
                      <div className="profile-dropdown-avatar">
                        <i className="fa-solid fa-user"></i>
                      </div>
                      <div className="profile-dropdown-info">
                        <span className="profile-dropdown-email">{user?.email}</span>
                        <span className="profile-dropdown-role">{role}</span>
                      </div>
                    </div>
                    <div className="profile-dropdown-item">
                      <i className="fa-solid fa-user-gear icon-sm"></i>Profile Settings
                    </div>
                    <div className="profile-dropdown-item">
                      <i className="fa-solid fa-lock icon-sm"></i>Change Password
                    </div>
                    <div className="profile-dropdown-item danger" onClick={logout}>
                      <i className="fa-solid fa-arrow-right-from-bracket icon-sm"></i>Log Out
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>

        <div className="page-body">

          {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.82rem",
            color: "var(--text-muted)",
            marginBottom: "1.5rem",
          }}
        >
          <a href="/reports" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            Admin
          </a>

          <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.65rem" }} />

          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            Github Sync
          </span>
        </div>

          <div className="page-header">
            <h1>GitHub Sync</h1>
            <p>Monitor sync status and rate limit budget across all repositories</p>
          </div>

          {/* Rate limit banner */}
          <div className="banner" style={{ marginBottom: '2rem' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="banner-label">
                <i className="fa-brands fa-github"></i>
                API Rate Limit
              </div>
              <p className="banner-title">
                {loading ? 'Loading…' : `${syncData?.rate_limit?.remaining?.toLocaleString()} / ${syncData?.rate_limit?.limit?.toLocaleString()} requests remaining`}
              </p>
              <p className="banner-subtitle">
                {syncData?.rate_limit?.reset
                  ? `Resets at ${new Date(syncData.rate_limit.reset).toLocaleTimeString()}`
                  : 'Rate limit resets hourly'}
              </p>
              {!loading && (
                <div style={{ marginTop: '1rem', maxWidth: '320px' }}>
                  <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${rateUsed}%`,
                      height: '100%',
                      background: 'white',
                      borderRadius: '999px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                    {rateUsed}% used
                  </p>
                </div>
              )}
            </div>
            <i className="fa-solid fa-gauge-high banner-shield"
              style={{ fontSize: '5rem', color: 'rgba(255,255,255,0.12)', position: 'relative', zIndex: 1 }}
            ></i>
          </div>

          {/* Refresh button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={fetchStatus} style={{ padding: '0.5rem 1.25rem' }}>
              <i className="fa-solid fa-rotate-right icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Refresh
            </button>
          </div>

          {/* Repo sync status list */}
          {loading ? (
            <div className="card card-static" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
              <i className="fa-solid fa-spinner fa-spin icon-cyan icon-lg"></i>
              <p style={{ margin: 0 }}>Loading sync status…</p>
            </div>
          ) : syncData?.repos?.length === 0 ? (
            <div className="card card-static" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-inbox icon-lg" style={{ marginBottom: '0.75rem', display: 'block' }}></i>
              No repos synced yet. Browse to a repository to trigger the first sync.
            </div>
          ) : (
            <div className="card card-static" style={{ padding: 0 }}>
              {syncData?.repos?.map((repo: any, i: number) => (
                <div
                  key={repo.repo}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1.25rem 1.5rem',
                    borderBottom: i < syncData.repos.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    background: `${statusColor(repo.status)}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <i className={`fa-solid ${statusIcon(repo.status)}`} style={{ color: statusColor(repo.status) }}></i>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', marginBottom: '0.2rem' }}>
                      {repo.repo}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>
                        <i className="fa-solid fa-clock icon-sm" style={{ marginRight: '0.3rem' }}></i>
                        {repo.last_sync_at
                          ? new Date(repo.last_sync_at).toLocaleString()
                          : 'Never synced'}
                      </span>
                      <span>
                        <i className="fa-solid fa-code-commit icon-sm" style={{ marginRight: '0.3rem' }}></i>
                        {repo.commits_synced} commits
                      </span>
                      <span>
                        <i className="fa-solid fa-code-pull-request icon-sm" style={{ marginRight: '0.3rem' }}></i>
                        {repo.prs_synced} PRs
                      </span>
                    </p>
                    {repo.error && (
                      <p style={{ fontSize: '0.75rem', color: '#f43f5e', marginTop: '0.25rem', margin: 0 }}>
                        <i className="fa-solid fa-triangle-exclamation icon-sm" style={{ marginRight: '0.3rem' }}></i>
                        {repo.error}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span style={{
                      padding: '0.25rem 0.75rem', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      background: `${statusColor(repo.status)}15`,
                      color: statusColor(repo.status),
                      border: `1px solid ${statusColor(repo.status)}40`,
                      textTransform: 'capitalize',
                    }}>
                      {repo.status}
                    </span>
                    <button
                      onClick={() => triggerSync(repo.repo)}
                      disabled={syncing === repo.repo}
                      className="btn-ghost btn-sm"
                    >
                      <i className={`fa-solid ${syncing === repo.repo ? 'fa-spinner fa-spin' : 'fa-rotate-right'} icon-sm`}
                        style={{ marginRight: '0.3rem' }}></i>
                      {syncing === repo.repo ? 'Syncing…' : 'Sync'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}