'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import PageNav from "@/app/components/PageNav";

export default function ReportsPage() {
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

  const reportSections = [
  {
    heading: 'Code & Delivery',
    items: [
      {
        title: 'GitHub Sync',
        desc: 'Monitor sync status and API rate limits across repositories.',
        icon: 'fa-solid fa-github',
        href: '/reports/github_sync',
      },
      {
        title: 'Code Quality Center',
        desc: 'View complexity trends, lint issues, secret scanning alerts, and repo health.',
        icon: 'fa-solid fa-code',
        href: '/reports/code_quality',
      },
      {
        title: 'DORA Delivery Metrics',
        desc: 'Track deployment frequency, lead time, change failure rate, restore time, review latency, and defect origin analysis.',
        icon: 'fa-solid fa-chart-line',
        href: '/reports/dora',
      },
      {
        title: 'Defect Risk Watchlist',
        desc: 'Rank files by predicted defect probability using ML.',
        icon: 'fa-solid fa-bug',
        href: '/reports/defect_risk',
      },
    ],
  },
];

  return (
    <ProtectedRoute>
      <div className="page">

        <PageNav active="reports" />
        
        <div className="page-body">
        <div className="page-header">
          <h1>Reports</h1>
          <p>Access, audit, security insights, and attendance across the organization</p>
        </div>

        {reportSections.map((section) => (
          <div key={section.heading} style={{ marginBottom: '2rem' }}>

            {/* Section divider label — matches admin page styling */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap', }}>
                {section.heading}
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <div className="stats-grid">
              {section.items.map((report) => (
                <a href={report.href} className="card stat-card"
                  key={report.title} style={{ textDecoration: 'none' }}>
                  <div className="icon-row">
                    <div className="icon-badge icon-badge-cyan">
                      <i className={report.icon} />
                    </div>
                  </div>
                  <h3 style={{ marginTop: '0.75rem', marginBottom: '0.4rem' }}>{report.title}</h3>
                  <p style={{ fontSize: '0.875rem' }}>{report.desc}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>
    </ProtectedRoute>
  );
}