'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';
import PageNav from '@/app/components/PageNav';

function RepositoriesPageContent() {
  return <RepositoriesContent />;}

function RepositoriesContent() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const searchParams = useSearchParams();

  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleConnectGitHub = () => {
    const token = getToken();
    if (!token) {
      alert('Please log in first.');
      return;
    }
    // for localhost
    // window.location.href = `http://localhost:8000/api/v1/github/login?token=${token}`;
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/github/login?token=${token}`;
  };

  useEffect(() => {
    const connected = searchParams.get('github_connected');
    if (connected) {
      window.history.replaceState({}, '', '/repositories');
    }
  }, [searchParams]);

  const disconnectGitHub = async () => {
    try {
      const token = getToken();
      await fetchWithAuth('api/v1/github/disconnect', token!, { method: 'DELETE' });
      setRepos([]);
      alert('GitHub disconnected. You will need to log in again next time.'); // optional
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
        const token = getToken();
        const data = await fetchWithAuth('api/v1/github/repositories', token!);
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

        <PageNav active="repositories" />

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
                <button
                  onClick={handleConnectGitHub}
                  className="banner-badge"
                  style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}
                >
                  <i className="fa-brands fa-github icon-sm"></i>
                  Connect GitHub
                </button>
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
                  {/* {repo.description && (
                    <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{repo.description}</p>
                  )} */}
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

export default function RepositoriesPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRoute>
          <div className="page">
            <PageNav active="repositories" />
            <div className="page-body">
              <p>Loading...</p>
            </div>
          </div>
        </ProtectedRoute>
      }
    >
      <RepositoriesPageContent />
    </Suspense>
  );
}