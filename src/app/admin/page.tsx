'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';

const adminSections = [
  {
    heading: 'People & Access',
    items: [
      {
        title: 'User Management',
        desc: 'Create, edit, and manage user accounts and role assignments.',
        icon: 'fa-users-gear',
        href: '/admin/users',
        meta: 'Roles · Permissions',
        isBrand: false,
        highlight: false,
      },
      {
        title: 'Access Control',
        desc: 'Configure access policies, zones, and permission scopes.',
        icon: 'fa-key',
        href: '/admin/access-control',
        meta: 'Policies · Zones',
        isBrand: false,
        highlight: false,
      },
    ],
  },
  {
  heading: 'System',
  items: [
    {
      title: 'System Settings',
      desc: 'Manage global configuration, feature flags, and preferences.',
      icon: 'fa-sliders',
      href: '/admin/settings',
      meta: 'Config · Flags',
      isBrand: false,
      highlight: false,
    },
    {
      title: 'Audit Logs',
      desc: 'Full tamper-evident trail of every administrative action.',
      icon: 'fa-file-shield',
      href: '/admin/audit-logs',
      meta: 'Logs · Compliance',
      isBrand: false,
      highlight: false,
    },
    {
      title: 'Security Center',
      desc: 'Review security metrics, flagged access events, and anomaly investigations.',
      icon: 'fa-shield-halved',
      href: '/admin/security',
      meta: 'Metrics · Review Queue',
      isBrand: false,
      highlight: true,
    },
  ],
},
  {
    heading: 'Integrations',
    items: [
      {
        title: 'Integrations',
        desc: 'Connect and manage third-party services and webhooks.',
        icon: 'fa-plug',
        href: '/admin/integrations',
        meta: 'Webhooks · APIs',
        isBrand: false,
        highlight: false,
      },
      {
        title: 'GitHub Sync',
        desc: 'Monitor sync status and API rate limits across repositories.',
        icon: 'fa-github',
        href: '/admin/github_sync',
        meta: 'Sync · Rate Limits',
        isBrand: true,
        highlight: true,
      },
    ],
  },
];

export default function AdminPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
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

  return (
    <ProtectedRoute>
      <div className="page">

        {/* ── Nav ── */}
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
              {['admin', 'leadership', 'manager'].includes(role) && (
                <a href="/reports" className="nav-link">
                  <i className="fa-solid fa-chart-bar icon-sm" style={{ marginRight: '0.4rem' }}></i>
                  Reports
                </a>
              )}
              {['admin', 'leadership'].includes(role) && (
                <a href="/admin" className="nav-link active">
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

        {/* ── Body ── */}
        <div className="page-body">

          {/* Page header */}
          <div className="page-header" style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(6,182,212,0.3)',
                flexShrink: 0,
              }}>
                <i className="fa-solid fa-screwdriver-wrench" style={{ color: 'white', fontSize: '1.1rem' }}></i>
              </div>
              <h1 style={{ marginBottom: 0 }}>Admin Console</h1>
            </div>
            <p style={{ marginLeft: '3.5rem' }}>Configure users, system settings, and integrations.</p>
          </div>

          {/* Quick stats strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem',
            marginBottom: '2.5rem',
          }}>
            {[
              { label: 'Active Users',      value: '—', icon: 'fa-users' },
              { label: 'Open Policies',     value: '—', icon: 'fa-key' },
              { label: 'Audit Events (24h)', value: '—', icon: 'fa-file-shield' },
              { label: 'Integrations',      value: '2', icon: 'fa-plug' },
            ].map((s) => (
              <div
                key={s.label}
                className="card card-static"
                style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                  background: 'rgba(6,182,212,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`fa-solid ${s.icon}`} style={{ color: '#06b6d4', fontSize: '0.9rem' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1, color: 'var(--text)' }}>{s.value}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Grouped sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {adminSections.map((section) => (
              <div key={section.heading}>

                {/* Section divider label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}>
                    {section.heading}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                </div>

                {/* Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '1.25rem',
                }}>
                  {section.items.map((item) => (
                    <a
                      key={item.title}
                      href={item.href}
                      className="card"
                      style={{
                        textDecoration: 'none',
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        border: item.highlight ? '1px solid rgba(6,182,212,0.3)' : undefined,
                        background: item.highlight ? 'rgba(6,182,212,0.04)' : undefined,
                      }}
                    >
                      {/* Icon row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{
                          width: '46px', height: '46px', borderRadius: '14px', flexShrink: 0,
                          background: item.highlight ? 'rgba(6,182,212,0.14)' : 'rgba(6,182,212,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <i
                            className={`${item.isBrand ? 'fa-brands' : 'fa-solid'} ${item.icon}`}
                            style={{ color: '#06b6d4', fontSize: '1.2rem' }}
                          ></i>
                        </div>
                        <i className="fa-solid fa-arrow-right" style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginTop: '0.25rem' }}></i>
                      </div>

                      <h3 style={{ marginBottom: '0.35rem', fontSize: '0.95rem' }}>{item.title}</h3>
                      <p style={{ fontSize: '0.82rem', lineHeight: 1.55, marginBottom: '1rem' }}>{item.desc}</p>

                      {/* Meta pill */}
                      <div style={{ marginTop: 'auto' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.7rem', fontWeight: 600,
                          padding: '0.25rem 0.65rem',
                          borderRadius: '999px',
                          background: 'rgba(6,182,212,0.08)',
                          color: '#0891b2',
                          border: '1px solid rgba(6,182,212,0.15)',
                          letterSpacing: '0.03em',
                        }}>
                          {item.meta}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
