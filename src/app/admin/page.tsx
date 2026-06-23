'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import PageNav from '@/app/components/PageNav';

const adminSections = [
  // {
  //   heading: 'People & Access',
  //   items: [
  //     {
  //       title: 'User Management',
  //       desc: 'Create, edit, and manage user accounts and role assignments.',
  //       icon: 'fa-users-gear',
  //       href: '/admin/users',
  //       meta: 'Roles · Permissions',
  //     },
  //     {
  //       title: 'Access Control',
  //       desc: 'Configure access policies, zones, and permission scopes.',
  //       icon: 'fa-key',
  //       href: '/admin/access-control',
  //       meta: 'Policies · Zones',
  //     },
  //   ],
  // },
  {
  heading: 'System',
  items: [
    // {
    //   title: 'System Settings',
    //   desc: 'Manage global configuration, feature flags, and preferences.',
    //   icon: 'fa-sliders',
    //   href: '/admin/settings',
    //   meta: 'Config · Flags',
    // },
    // {
    //   title: 'Audit Logs',
    //   desc: 'Full tamper-evident trail of every administrative action.',
    //   icon: 'fa-file-shield',
    //   href: '/admin/audit-logs',
    //   meta: 'Logs · Compliance',
    // },
    {
      title: 'Security Center',
      desc: 'Review security metrics, flagged access events, and anomaly investigations.',
      icon: 'fa-solid fa-shield-halved',
      href: '/admin/security',
      meta: 'Metrics · Review Queue',
    },
    {
      title: 'Code Quality Center',
      desc: 'View complexity trends, lint issues, secret scanning alerts, and repo health.',
      icon: 'fa-solid fa-code',
      href: '/admin/code_quality',
      meta: 'Quality · Security · Trends',
    },
    {
      title: 'DORA Delivery Metrics',
      desc: 'Track deployment frequency, lead time, change failure rate, restore time, review latency, and defect origin analysis.',
      icon: 'fa-solid fa-chart-line',
      href: '/admin/dora',
      meta: 'DORA · DevOps Metrics',
    },
    {
      title: 'Behavioural Cohorts',
      desc: 'Cluster users based on session behavior patterns using ML (K-Means / DBSCAN).',
      icon: 'fa-solid fa-object-group',
      href: '/admin/cohorts',
      meta: 'ML · Segmentation',
    },
    {
      title: 'Defect Risk Watchlist',
      desc: 'Rank files by predicted defect probability using ML.',
      icon: 'fa-solid fa-bug',
      href: '/admin/defect_risk',
      meta: 'ML · Risk · Code Health',
    },
    {
      title: 'ROI Tracking',
      desc: 'Realised vs illustrative value tracking.',
      icon: 'fa-solid fa-indian-rupee-sign',
      href: '/admin/roi',
      meta: 'ROI · Quarterly Review',
    }
  ],
},
  {
    heading: 'Integrations',
    items: [
      // {
      //   title: 'Integrations',
      //   desc: 'Connect and manage third-party services and webhooks.',
      //   icon: 'fa-plug',
      //   href: '/admin/integrations',
      //   meta: 'Webhooks · APIs',
      // },
      {
        title: 'GitHub Sync',
        desc: 'Monitor sync status and API rate limits across repositories.',
        icon: 'fa-solid fa-github',
        href: '/admin/github_sync',
        meta: 'Sync · Rate Limits',
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

        <PageNav active="admin" />

        {/* ── Body ── */}
        <div className="page-body">

          {/* Page header */}
          <div className="page-header" style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ marginBottom: '0.5rem' }}>Admin Console</h1>
            <p>Configure users, system settings, and integrations.</p>
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
                style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
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
                      }}>
                    {/* Icon row */}
                    <div className="icon-row">
                    <div className="icon-badge icon-badge-cyan">
                    <i className={item.icon} />
                    </div>
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