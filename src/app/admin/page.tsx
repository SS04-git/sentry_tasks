'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';
import PageNav from '@/app/components/PageNav';

const adminSections = [
  {
    heading: 'People Analytics',
    items: [
      {
        title: 'Attendance & Presence',
        desc: 'Days present, arrival times, session hours, and weekly trends.',
        icon: 'fa-solid fa-calendar-check',
        href: '/admin/attendance',
        meta: 'Presence · Trends',
      },
      {
        title: 'Occupancy Analytics',
        desc: 'Peak occupancy, forecasts, and mobile adoption trends.',
        icon: 'fa-solid fa-building-user',
        href: '/admin/occupancy',
        meta: 'Occupancy · Forecasts',
      },
      {
        title: 'Behavioural Cohorts',
        desc: 'Cluster users based on session behavior patterns using ML (K-Means / DBSCAN).',
        icon: 'fa-solid fa-object-group',
        href: '/admin/cohorts',
        meta: 'ML · Segmentation',
      },
    ],
  },
  {
    heading: 'Security & Governance',
    items: [
      {
        title: 'Security Center',
        desc: 'Review security metrics, flagged access events, and anomaly investigations.',
        icon: 'fa-solid fa-shield-halved',
        href: '/admin/security',
        meta: 'Metrics · Review Queue',
      },
      {
        title: 'ROI Tracking',
        desc: 'Realised vs illustrative value tracking.',
        icon: 'fa-solid fa-indian-rupee-sign',
        href: '/admin/roi',
        meta: 'ROI · Quarterly Review',
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

  const [activeUsers, setActiveUsers] = useState<number | null>(null);
  const [auditCount24h, setAuditCount24h] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const integrations = 2; // static — no integrations endpoint exists yet

  useEffect(() => {
    const loadStats = async () => {
      const token = getToken();
      if (!token) return;
      try {
        if (['admin', 'leadership'].includes(role)) {
          const users = await fetchWithAuth('api/v1/users/', token);
          setActiveUsers(users.filter((u: { is_active: boolean }) => u.is_active).length);

          const logs: { created_at: string }[] = await fetchWithAuth('api/v1/users/audit-logs', token);
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          setAuditCount24h(logs.filter((l) => new Date(l.created_at).getTime() >= cutoff).length);
        }
      } catch (err) {
        console.error('Failed to load admin stats', err);
      } finally {
        setLoadingStats(false);
      }
    };
    loadStats();
  }, [role]);

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav active="admin" />
        <div className="page-body">

          <div className="page-header" style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ marginBottom: '0.5rem' }}>Admin Console</h1>
            <p>Configure users, system settings, and integrations.</p>
          </div>

          {/* Quick stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
            {[
              {
                label: 'Active Users',
                value: ['admin', 'leadership'].includes(role) ? (activeUsers ?? '—') : '—',
                icon: 'fa-users',
              },
              {
                label: 'Audit Events (24h)',
                value: ['admin', 'leadership'].includes(role) ? (auditCount24h ?? '—') : '—',
                icon: 'fa-file-shield',
              },
              {
                label: 'Integrations',
                value: integrations,
                icon: 'fa-plug',
              },
            ].map((s) => (
              <div key={s.label} className="card card-static"
                style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                  background: 'rgba(6,182,212,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`fa-solid ${s.icon}`} style={{ color: '#06b6d4', fontSize: '0.9rem' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1, color: 'var(--text)' }}>
                    {loadingStats && s.label !== 'Integrations' ? <i className="fa-solid fa-spinner fa-spin" /> : s.value}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
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
                    fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
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
                    <div className="icon-row" style={{ marginBottom: '0.85rem' }}>
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
                          fontSize: '12px', fontWeight: 600,
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
