// new version
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';
import PageNav from '@/app/components/PageNav';

type Tab = 'commits' | 'stats' | 'pulls';

export default function RepoDetailPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const params = useParams();
  const owner = params.owner as string;
  const repo = params.repo as string;

  const [activeTab, setActiveTab] = useState<Tab>('commits');
  const [commits, setCommits] = useState<any[]>([]);
  const [commitsPage, setCommitsPage] = useState(1);
  const [hasMoreCommits, setHasMoreCommits] = useState(false);
  const [loadingMoreCommits, setLoadingMoreCommits] = useState(false);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [pulls, setPulls] = useState<any[]>([]);
  const [repoDetails, setRepoDetails] = useState<any>(null);

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
  const fetchAll = async () => {
    setLoading(true);

    try {
      const token = getToken();

      const [commitsData, statsData, pullsData, repoData] = await Promise.all([
        fetchWithAuth(`api/v1/github/repos/${owner}/${repo}/commits?page=1`, token!),
        fetchWithAuth(`api/v1/github/repos/${owner}/${repo}/stats`, token!),
        fetchWithAuth(`api/v1/github/repos/${owner}/${repo}/pulls`, token!),
        fetchWithAuth(`api/v1/github/repos/${owner}/${repo}`, token!),
      ]);

      setCommits(Array.isArray(commitsData?.commits) ? commitsData.commits : []);
      setCommitsPage(1);
      setHasMoreCommits(Boolean(commitsData?.has_more));
      setStats(Array.isArray(statsData) ? statsData : []);
      setPulls(Array.isArray(pullsData) ? pullsData : []);
      setRepoDetails(repoData);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  fetchAll();
}, [owner, repo]);

const retryStats = () => {
  setStatsLoading(true);

  const token = getToken();

  fetchWithAuth(`api/v1/github/repos/${owner}/${repo}/stats`, token!)
    .then((d) => {
      setStats(Array.isArray(d) ? d : []);
    })
    .catch(() => {})
    .finally(() => setStatsLoading(false));
};

const loadMoreCommits = async () => {
  setLoadingMoreCommits(true);
  try {
    const token = getToken();
    const nextPage = commitsPage + 1;
    const data = await fetchWithAuth(
      `api/v1/github/repos/${owner}/${repo}/commits?page=${nextPage}`,
      token!
    );
    setCommits((prev) => [...prev, ...(Array.isArray(data?.commits) ? data.commits : [])]);
    setCommitsPage(nextPage);
    setHasMoreCommits(Boolean(data?.has_more));
  } catch (err) {
    console.error(err);
  } finally {
    setLoadingMoreCommits(false);
  }
};

const tabStyle = (tab: Tab): React.CSSProperties => ({
  padding: '0.5rem 1.25rem',
  borderRadius: '999px',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: 'none',
  background:
    activeTab === tab
      ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
      : 'transparent',
  color: activeTab === tab ? 'white' : 'var(--text-muted)',
  boxShadow:
    activeTab === tab
      ? '0 4px 14px rgba(6,182,212,0.35)'
      : 'none',
  transition: 'all 0.2s ease',
});

const totalAdditions = stats.reduce((sum, c) => sum + c.additions, 0);
const totalDeletions = stats.reduce((sum, c) => sum + c.deletions, 0);
const totalCommits = stats.reduce((sum, c) => sum + c.commits, 0);

  

  return (
    <ProtectedRoute>
      <div className="page">

        <PageNav active="repositories" />

        <div className="page-body">

          {/* Banner */}
          <div className="banner" style={{ marginBottom: '2rem' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="banner-label">
                <a
                  href="/repositories"
                  style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <i className="fa-solid fa-arrow-left icon-sm"></i>
                  Repositories
                </a>
              </div>
              <p className="banner-title" style={{ marginTop: '0.5rem' }}>{repo}</p>
              <p className="banner-subtitle">{owner} / {repo}</p>
              {!loading && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  <span className="banner-badge">
                    <i className="fa-solid fa-code-commit icon-sm"></i>
                    {commits.length} commits loaded
                  </span>
                  {stats.length > 0 && (
                    <span className="banner-badge">
                      <i className="fa-solid fa-users icon-sm"></i>
                      {stats.length} contributors
                    </span>
                  )}
                  {repoDetails?.description && (<p style={{ fontSize: '0.875rem', marginTop: '0.75rem', color: 'white' }}>
                  {repoDetails.description}</p>)}
                </div>
              )}
            </div>
            <i
              className="fa-solid fa-code-branch banner-shield"
              style={{ fontSize: '5rem', color: 'rgba(255,255,255,0.12)', position: 'relative', zIndex: 1 }}
            ></i>
          </div>

          {/* Summary stats */}
          {!loading && stats.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '2rem' }}>
              <div className="card stat-card">
                <div className="icon-badge icon-badge-cyan">
                  <i className="fa-solid fa-code-commit icon-cyan icon-lg"></i>
                </div>
                <p className="stat-label">Total Commits</p>
                <p className="stat-value">{totalCommits.toLocaleString()}</p>
              </div>
              <div className="card stat-card">
                <div className="icon-badge" style={{ background: 'rgba(16,185,129,0.12)', marginBottom: '1rem', width: '56px', height: '56px', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-plus icon-lg" style={{ color: '#10b981' }}></i>
                </div>
                <p className="stat-label">Total Additions</p>
                <p className="stat-value" style={{ color: '#10b981' }}>+{totalAdditions.toLocaleString()}</p>
              </div>
              <div className="card stat-card">
                <div className="icon-badge" style={{ background: 'rgba(244,63,94,0.12)', marginBottom: '1rem', width: '56px', height: '56px', borderRadius: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-minus icon-lg" style={{ color: '#f43f5e' }}></i>
                </div>
                <p className="stat-label">Total Deletions</p>
                <p className="stat-value" style={{ color: '#f43f5e' }}>-{totalDeletions.toLocaleString()}</p>
              </div>
              <div className="card stat-card">
                <div className="icon-badge icon-badge-cyan">
                  <i className="fa-solid fa-users icon-cyan icon-lg"></i>
                </div>
                <p className="stat-label">Contributors</p>
                <p className="stat-value">{stats.length}</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.6)', padding: '0.4rem', borderRadius: '999px', width: 'fit-content', border: '1px solid var(--border)' }}>
            <button style={tabStyle('commits')} onClick={() => setActiveTab('commits')}>
              <i className="fa-solid fa-clock-rotate-left icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Commits
            </button>
            <button style={tabStyle('stats')} onClick={() => setActiveTab('stats')}>
              <i className="fa-solid fa-chart-bar icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Code Stats
            </button>
            <button style={tabStyle('pulls')} onClick={() => setActiveTab('pulls')}>
              <i className="fa-solid fa-code-pull-request icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Pull Requests
            </button>
          </div>

          {loading ? (
            <div className="card card-static" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
              <i className="fa-solid fa-spinner fa-spin icon-cyan icon-lg"></i>
              <p style={{ margin: 0 }}>Loading repository data…</p>
            </div>
          ) : (
            <>
              {/* Commits Tab */}
              {activeTab === 'commits' && (
                <div className="card card-static" style={{ padding: 0 }}>
                  {commits.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <i className="fa-solid fa-inbox icon-lg" style={{ marginBottom: '0.75rem', display: 'block' }}></i>
                      No commits found.
                    </div>
                  ) : (
                    commits.map((commit, i) => (
                      <div
                        key={commit.sha}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '1rem 1.5rem',
                          borderBottom: i < commits.length - 1 ? '1px solid var(--border)' : 'none',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px',
                          background: 'var(--accent-light)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <i className="fa-solid fa-code-commit icon-cyan icon-sm"></i>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {commit.message}
                          </p>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="fa-solid fa-user icon-sm"></i>
                            {commit.author}
                            <span style={{ color: 'var(--border)' }}>·</span>
                            <i className="fa-regular fa-calendar icon-sm"></i>
                            {new Date(commit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontFamily: 'monospace', fontSize: '0.78rem',
                            color: 'var(--accent)', flexShrink: 0,
                            background: 'var(--accent-light)', padding: '0.25rem 0.6rem',
                            borderRadius: '6px', border: '1px solid rgba(6,182,212,0.2)',
                            textDecoration: 'none',
                          }}
                        >
                          {commit.sha}
                        </a>
                      </div>
                    ))
                  )}
                  {hasMoreCommits && (
                    <div style={{ padding: '1rem', textAlign: 'center' }}>
                      <button onClick={loadMoreCommits} disabled={loadingMoreCommits}>
                        <i className={`fa-solid ${loadingMoreCommits ? 'fa-spinner fa-spin' : 'fa-chevron-down'} icon-sm`} style={{ marginRight: '0.4rem' }}></i>
                        {loadingMoreCommits ? 'Loading…' : 'Load more commits'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Tab */}
              {activeTab === 'stats' && (
                <>
                  {stats.length === 0 ? (
                    <div className="card card-static" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
                      <i className="fa-solid fa-clock icon-cyan" style={{ fontSize: '2rem' }}></i>
                      <div>
                        <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>Stats are being computed</p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>GitHub computes these on first request. Try again in a moment.</p>
                      </div>
                      <button onClick={retryStats} disabled={statsLoading} style={{ marginTop: '0.5rem' }}>
                        <i className={`fa-solid ${statsLoading ? 'fa-spinner fa-spin' : 'fa-rotate-right'} icon-sm`} style={{ marginRight: '0.4rem' }}></i>
                        {statsLoading ? 'Retrying…' : 'Retry'}
                      </button>
                    </div>
                  ) : (
                    <div className="stats-grid">
                      {stats.map((contributor) => {
                        const total = contributor.additions + contributor.deletions;
                        const addPct = total > 0 ? Math.round((contributor.additions / total) * 100) : 0;
                        return (
                          <div key={contributor.author} className="card stat-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                              {contributor.avatar ? (
                                <img
                                  src={contributor.avatar}
                                  alt={contributor.author}
                                  style={{ width: '44px', height: '44px', borderRadius: '12px', border: '2px solid var(--accent-light)' }}
                                />
                              ) : (
                                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <i className="fa-solid fa-user icon-cyan icon-sm"></i>
                                </div>
                              )}
                              <div>
                                <h3 style={{ marginBottom: '0.15rem' }}>{contributor.author}</h3>
                                <p style={{ fontSize: '0.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <i className="fa-solid fa-code-commit icon-sm"></i>
                                  {contributor.commits} commits
                                </p>
                              </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-alt)', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${addPct}%`, background: '#10b981', borderRadius: '999px 0 0 999px', transition: 'width 0.4s ease' }} />
                                <div style={{ flex: 1, background: '#f43f5e', borderRadius: '0 999px 999px 0' }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                                <span style={{ fontSize: '12px', color: '#10b981' }}>{addPct}% additions</span>
                                <span style={{ fontSize: '12px', color: '#f43f5e' }}>{100 - addPct}% deletions</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                              <div style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <p style={{ fontSize: '12px', color: '#10b981', fontWeight: 700, marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Additions</p>
                                <p style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981', margin: 0 }}>+{contributor.additions.toLocaleString()}</p>
                              </div>
                              <div style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                                <p style={{ fontSize: '12px', color: '#f43f5e', fontWeight: 700, marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deletions</p>
                                <p style={{ fontSize: '1rem', fontWeight: 800, color: '#f43f5e', margin: 0 }}>-{contributor.deletions.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Pulls Tab */}
              {activeTab === 'pulls' && (
                <div className="card card-static" style={{ padding: 0 }}>
                  {pulls.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <i className="fa-solid fa-code-pull-request icon-lg" style={{ marginBottom: '0.75rem', display: 'block' }}></i>
                      No pull requests found.
                    </div>
                  ) : (
                    pulls.map((pr, i) => (
                      <div
                        key={pr.number}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '1rem',
                          padding: '1rem 1.5rem',
                          borderBottom: i < pulls.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                          background: pr.merged
                            ? 'rgba(139,92,246,0.12)'
                            : pr.state === 'open'
                            ? 'rgba(6,182,212,0.12)'
                            : 'rgba(100,116,139,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <i
                            className="fa-solid fa-code-pull-request icon-sm"
                            style={{ color: pr.merged ? '#8b5cf6' : pr.state === 'open' ? '#06b6d4' : '#64748b' }}
                          ></i>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pr.title}
                          </p>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="fa-solid fa-user icon-sm"></i>
                            {pr.author}
                            <span style={{ color: 'var(--border)' }}>·</span>
                            {new Date(pr.opened_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {pr.draft && (
                              <span style={{ padding: '0.1rem 0.5rem', borderRadius: '999px', background: 'rgba(100,116,139,0.1)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
                                Draft
                              </span>
                            )}
                          </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <span style={{
                            padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                            background: pr.merged ? 'rgba(139,92,246,0.12)' : pr.state === 'open' ? 'rgba(6,182,212,0.12)' : 'rgba(100,116,139,0.12)',
                            color: pr.merged ? '#8b5cf6' : pr.state === 'open' ? '#06b6d4' : '#64748b',
                            border: `1px solid ${pr.merged ? 'rgba(139,92,246,0.25)' : pr.state === 'open' ? 'rgba(6,182,212,0.25)' : 'rgba(100,116,139,0.25)'}`,
                          }}>
                            {pr.merged ? 'Merged' : pr.state === 'open' ? 'Open' : 'Closed'}
                          </span>
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--accent)',
                              background: 'var(--accent-light)', padding: '0.25rem 0.6rem',
                              borderRadius: '6px', border: '1px solid rgba(6,182,212,0.2)', textDecoration: 'none',
                            }}>
                            #{pr.number}
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
                </>
              )}
              </div>
      </div>
    </ProtectedRoute>
  );
}
