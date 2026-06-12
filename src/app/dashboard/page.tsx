'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

interface AuditLog {
  id: number;
  action: string;
  performed_by: string;
  target_user: string | null;
  detail: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [activeUsers, setActiveUsers] = useState<number | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

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
    const loadDashboardData = async () => {
      const token = getToken();
      if (!token) return;

      try {
        // only admin/leadership can call these endpoints
        if (['admin', 'leadership'].includes(role)) {
          const users = await fetchWithAuth('api/v1/users/', token);
          setActiveUsers(users.filter((u: { is_active: boolean }) => u.is_active).length);

          const logs: AuditLog[] = await fetchWithAuth('api/v1/users/audit-logs', token);
          setAuditCount(logs.length);
          setRecentLogs(logs.slice(0, 3));
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoadingStats(false);
      }
    };

    loadDashboardData();
  }, [role]);

  const stats = [
    {
      label: 'Active Users',
      value: ['admin', 'leadership'].includes(role)
        ? (activeUsers ?? '—')
        : '—',
      icon: 'fa-users',
      trend: '',
    },
    {
      label: 'Audit Events',
      value: ['admin', 'leadership'].includes(role)
        ? (auditCount ?? '—')
        : '—',
      icon: 'fa-clipboard-list',
      trend: '',
    },
    {
      label: 'Security Alerts',
      value: '—',
      icon: 'fa-triangle-exclamation',
      trend: '',
    },
    {
      label: 'Last Login',
      value: 'Now',
      icon: 'fa-clock',
      trend: 'Live',
    },
  ];

  // map audit action -> readable label + icon
  const actionMeta: Record<string, { title: string; desc: (l: AuditLog) => string }> = {
    create_user:  { title: 'User Created',  desc: (l) => `${l.target_user} was added` },
    update_user:  { title: 'User Updated',  desc: (l) => `${l.target_user} was updated` },
    disable_user: { title: 'User Disabled', desc: (l) => `${l.target_user} was disabled` },
    enable_user:  { title: 'User Enabled',  desc: (l) => `${l.target_user} was enabled` },
    assign_role:  { title: 'Role Changed',  desc: (l) => `${l.target_user}: ${l.detail ?? ''}` },
  };

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
      <a href="/dashboard" className="nav-link active">
        <i className="fa-solid fa-gauge icon-sm" style={{ marginRight: '0.4rem' }}></i>
        Dashboard
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

          {/* Top Section */}
          <div className="dashboard-top">

            <div className="banner">
              <div>
                <p className="banner-label">
                  <i className="fa-solid fa-hand-wave"></i>
                  Welcome back
                </p>

                <h1 className="banner-title">
                  {user?.email?.split("@")[0]}
                </h1>

                <p className="banner-subtitle">
                  Security monitoring dashboard
                </p>

                <span className="banner-badge">
                  <i className="fa-solid fa-id-badge"></i>
                  {role}
                </span>
              </div>

              <div className="banner-shield">
                <i className="fa-solid fa-shield-halved"></i>
              </div>
            </div>

            <div className="card user-card">
              <div className="user-avatar">
                <i className="fa-solid fa-user"></i>
              </div>

              <div className="user-name">
                {user?.email?.split("@")[0]}
              </div>

              <div className="user-role">
                {role}
              </div>

              <div className="user-status">
                <span className="status-dot"></span>
                Active Session
              </div>
            </div>

          </div>

          {/* Stats */}
          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="card stat-card" key={stat.label}>
                <div className="stat-top">
                  <div className="icon-badge icon-badge-cyan">
                    <i className={`fa-solid ${stat.icon} icon-cyan`}></i>
                  </div>
                  {stat.trend && (
                    <div className="stat-trend">
                      {stat.trend}
                    </div>
                  )}
                </div>

                <div className="stat-value">
                  {loadingStats && ['admin', 'leadership'].includes(role) && stat.label !== 'Last Login'
                    ? <i className="fa-solid fa-spinner fa-spin"></i>
                    : stat.value}
                </div>

                <div className="stat-label">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Main Grid */}
          <div className="dashboard-grid">

            <div className="dashboard-column">

              <div className="card">
                <div className="section-header">
                  <i className="fa-solid fa-clock-rotate-left icon-cyan"></i>
                  <h2>Recent Security Activity</h2>
                </div>

                <div className="activity-list">
                  {['admin', 'leadership'].includes(role) ? (
                    recentLogs.length > 0 ? (
                      recentLogs.map((log) => {
                        const meta = actionMeta[log.action] ?? {
                          title: log.action,
                          desc: () => log.detail ?? '',
                        };
                        return (
                          <div className="activity-item" key={log.id}>
                            <div className="activity-dot"></div>
                            <div>
                              <strong>{meta.title}</strong>
                              <p>{meta.desc(log)}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p style={{ fontSize: '0.875rem' }}>No recent activity</p>
                    )
                  ) : (
                    <p style={{ fontSize: '0.875rem' }}>
                      Activity logs are visible to admin and leadership roles only.
                    </p>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="section-header">
                  <i className="fa-solid fa-key icon-cyan"></i>
                  <h2>Permissions</h2>
                </div>

                <div className="access-grid">
                  {[
                    { label: 'Dashboard',    icon: 'fa-gauge',            roles: ['admin','leadership','manager','employee'] },
                    { label: 'Reports',      icon: 'fa-chart-bar',        roles: ['admin','leadership','manager'] },
                    { label: 'Admin',        icon: 'fa-screwdriver-wrench', roles: ['admin','leadership'] },
                    { label: 'Manage Users', icon: 'fa-users-gear',       roles: ['admin'] },
                  ].map((item) => {
                    const allowed = item.roles.includes(role);
                    return (
                      <div key={item.label} className={`access-pill ${allowed ? 'allowed' : ''}`}>
                        <i className={`fa-solid ${item.icon}`}></i>
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            <div className="dashboard-column">

              <div className="card">
                <div className="section-header">
                  <i className="fa-solid fa-circle-info icon-cyan"></i>
                  <h2>Account Details</h2>
                </div>

                <div>
                  {[
                    { label: 'Email',   value: user?.email },
                    { label: 'Role',    value: role },
                    { label: 'Status',  value: 'Active' },
                    { label: 'Session', value: 'Live' },
                  ].map((row) => (
                    <div key={row.label} className="info-row">
                      <span className="info-row-label">{row.label}</span>
                      <span className="info-row-value">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </ProtectedRoute>
  );
}