'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { saveToken } from '@/app/lib/auth';

export default function RepositoriesPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const searchParams = useSearchParams();

  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      saveToken(token);
      window.history.replaceState({}, '', '/repositories');
      window.location.reload();
    }
  }, []);

  const disconnectGitHub = async () => {
  try {
    await fetch('http://localhost:8000/api/v1/github/disconnect', 
    {
      method: 'DELETE',
    });
    setRepos([]);
  } catch (err) {
    console.error('Disconnect error:', err);
  }
};

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/v1/github/repositories');
        const data = await res.json();
        if (!res.ok) { setRepos([]); return; }
        if (Array.isArray(data)) setRepos(data);
        else setRepos([]);
      } catch {
        setRepos([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRepos();
  }, []);

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
                <i className="fa-solid fa-gauge icon-sm" style={{ marginRight: '0.4rem' }}></i>
                Dashboard
              </a>
              <a href="/repositories" className="nav-link active">
                <i className="fa-solid fa-code-branch icon-sm" style={{ marginRight: '0.4rem' }}></i>
                Repositories
              </a>
              {['admin', 'leadership', 'manager'].includes(role) && (
                <a href="/reports" className="nav-link">
                  <i className="fa-solid fa-chart-bar icon-sm" style={{ marginRight: '0.4rem' }}></i>
                  Reports
                </a>
              )}
              {['admin', 'leadership'].includes(role) && (
                <a href="/admin" className="nav-link">
                  <i className="fa-solid fa-screwdriver-wrench icon-sm" style={{ marginRight: '0.4rem' }}></i>
                  Admin
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
                      <i className="fa-solid fa-user-gear icon-sm"></i>
                      Profile Settings
                    </div>
                    <div className="profile-dropdown-item">
                      <i className="fa-solid fa-lock icon-sm"></i>
                      Change Password
                    </div>
                    <div className="profile-dropdown-item danger" onClick={logout}>
                      <i className="fa-solid fa-arrow-right-from-bracket icon-sm"></i>
                      Log Out
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </nav>

        <div className="page-body">

          <div className="page-header">
            <h1>Repositories</h1>
            <p>Manage and monitor your connected GitHub repositories</p>
          </div>

          <div className="banner" style={{ marginBottom: '2rem' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="banner-label">
                <i className="fa-brands fa-github"></i>
                GitHub Integration
              </div>
              <p className="banner-title">
                {loading ? 'Loading…' : `${repos.length} Repositories`}
              </p>
              <p className="banner-subtitle">
                Synced repositories across your organisation
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <a
                  href="http://localhost:8000/api/v1/github/login"
                  className="banner-badge"
                  style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none' }}
                >
                  <i className="fa-brands fa-github icon-sm"></i>
                  Connect GitHub
                </a>
                <button
                  onClick={disconnectGitHub}
                  className="banner-badge"
                  style={{ background: 'rgba(244,63,94,0.3)', color: 'white', border: '1px solid rgba(244,63,94,0.5)', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-link-slash icon-sm"></i>
                  Disconnect
                </button>
              </div>
            </div>
            <i
              className="fa-solid fa-code-branch banner-shield"
              style={{ fontSize: '5rem', color: 'rgba(255,255,255,0.12)', position: 'relative', zIndex: 1 }}
            ></i>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Fetching repositories…</p>
          ) : repos.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No repositories found or GitHub not connected.</p>
          ) : (
            <div className="stats-grid">
              {repos.map((repo) => (
                <a
                  key={repo.id}
                  href={`/repositories/${repo.owner.login}/${repo.name}`}
                  className="card stat-card"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="icon-badge icon-badge-cyan">
                    <i className="fa-solid fa-code-branch icon-cyan icon-lg"></i>
                  </div>
                  <h3 style={{ marginBottom: '0.4rem' }}>{repo.name}</h3>
                  {repo.description && (
                    <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{repo.description}</p>
                  )}
                  <span
                    className="banner-badge"
                    style={{
                      background: repo.private ? 'rgba(244,63,94,0.12)' : 'rgba(6,182,212,0.12)',
                      color: repo.private ? '#e11d48' : 'var(--accent-hover)',
                      border: `1px solid ${repo.private ? 'rgba(244,63,94,0.25)' : 'rgba(6,182,212,0.25)'}`,
                    }}
                  >
                    <i className={`fa-solid ${repo.private ? 'fa-lock' : 'fa-globe'} icon-sm`}></i>
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                  {repo.language && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      {repo.language}
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}