'use client';

import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';

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
              <span className="nav-email">
                <i className="fa-solid fa-circle-user icon-cyan" style={{ marginRight: '0.4rem' }}></i>
                {user?.email}
              </span>
              <button className="btn-ghost" onClick={logout}>
                <i className="fa-solid fa-arrow-right-from-bracket" style={{ marginRight: '0.4rem' }}></i>
                Log Out
              </button>
            </div>

          </div>
        </nav>

        <div className="page-body">

          {/* welcome banner */}
          <div className="banner">
            <div>
              <p className="banner-label">
                <i className="fa-solid fa-hand-wave" style={{ marginRight: '0.4rem' }}></i>
                Welcome back
              </p>
              <p className="banner-title">{user?.email}</p>
              <span className="banner-badge">
                <i className="fa-solid fa-id-badge" style={{ marginRight: '0.4rem' }}></i>
                {role}
              </span>
            </div>
            <i className="fa-solid fa-shield-halved" style={{ fontSize: '5rem', color: 'rgba(255,255,255,0.15)' }}></i>
          </div>

          {/* stats */}
          <div className="stats-grid">
            {[
              { label: 'Active Users',    value: '—', iconClass: 'fa-solid fa-users',          badgeClass: 'icon-badge-cyan',    iconColor: 'icon-cyan' },
              { label: 'Audit Events',    value: '—', iconClass: 'fa-solid fa-clipboard-list',  badgeClass: 'icon-badge-indigo',  iconColor: 'icon-indigo' },
              { label: 'Security Alerts', value: '—', iconClass: 'fa-solid fa-triangle-exclamation', badgeClass: 'icon-badge-rose', iconColor: 'icon-rose' },
              { label: 'Last Login',   value: 'Now', iconClass: 'fa-solid fa-clock',            badgeClass: 'icon-badge-emerald', iconColor: 'icon-emerald' },
            ].map((stat) => (
              <div key={stat.label} className="card" style={{ padding: '1.5rem' }}>
                <div className="stat-card-inner">
                  <div className={`icon-badge ${stat.badgeClass}`}>
                    <i className={`${stat.iconClass} ${stat.iconColor} icon-lg`}></i>
                  </div>
                  <div className="stat-card-text">
                    <div className="stat-value">{stat.value}</div>
                    <div className="stat-label">{stat.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* access level */}
          <div className="card" style={{ padding: '2rem' }}>
            <div className="section-header">
              <i className="fa-solid fa-key icon-amber icon-md"></i>
              <h2>Your Access Level</h2>
            </div>
            <div className="access-grid">
              {[
                { label: 'View Dashboard', icon: 'fa-solid fa-gauge',              roles: ['admin','leadership','manager','employee'] },
                { label: 'View Reports',   icon: 'fa-solid fa-chart-bar',          roles: ['admin','leadership','manager'] },
                { label: 'Admin Panel',    icon: 'fa-solid fa-screwdriver-wrench', roles: ['admin','leadership'] },
                { label: 'Manage Users',   icon: 'fa-solid fa-users-gear',         roles: ['admin'] },
              ].map((item) => {
                const allowed = item.roles.includes(role);
                return (
                  <div key={item.label} className={`access-pill ${allowed ? 'allowed' : ''}`}>
                    <i className={`${item.icon} icon-sm`}></i>
                    <span>{allowed ? '✓' : '✕'}</span>
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* account info */}
          <div className="card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
            <div className="section-header">
              <i className="fa-solid fa-circle-info icon-cyan icon-md"></i>
              <h2>Account Details</h2>
            </div>
            <div>
              {[
                { label: 'Email',    value: user?.email,  icon: 'fa-solid fa-envelope',  color: 'icon-cyan' },
                { label: 'Role',     value: role,         icon: 'fa-solid fa-id-badge',  color: 'icon-indigo' },
                { label: 'Status',   value: 'Active',     icon: 'fa-solid fa-circle-check', color: 'icon-emerald' },
                { label: 'Session',  value: 'Live',       icon: 'fa-solid fa-wifi',      color: 'icon-amber' },
              ].map((row) => (
                <div key={row.label} className="info-row">
                  <i className={`${row.icon} ${row.color} icon-sm`} style={{ width: '16px', textAlign: 'center' }}></i>
                  <span className="info-row-label">{row.label}</span>
                  <span className="info-row-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}