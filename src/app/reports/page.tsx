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

  const reports = [
    {
      title: 'Access Events',
      desc: 'View access activity by employee.',
      icon: 'fa-door-open',
      href: '/reports/access-events',
    },
    {
      title: 'Audit Activity',
      desc: 'Review system audit logs.',
      icon: 'fa-clipboard-list',
      href: '/reports/audit-activity',
    },
    {
      title: 'Security Alerts',
      desc: 'Analyze unusual access patterns.',
      icon: 'fa-triangle-exclamation',
      href: '/reports/security-alerts',
    },
    {
      title: 'Attendance & Presence',
      desc: 'Days present, arrival times, session hours, and weekly trends.',
      icon: 'fa-calendar-check',
      href: '/reports/attendance',
      highlight: true,
    },
    {
       title: 'Occupancy Analytics',
       desc: 'Peak occupancy, forecasts, and mobile adoption trends.',
       icon: 'fa-building-user',
       href: '/reports/occupancy',
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

          <div className="stats-grid">
            {reports.map((report) => (
              <a
                href={report.href}
                className="card stat-card"
                key={report.title}
                style={{
                  textDecoration: 'none',
                  border: report.highlight ? '1px solid rgba(6,182,212,0.3)' : undefined,
                  background: report.highlight ? 'rgba(6,182,212,0.04)' : undefined,
                }}
              >
                <div className="icon-badge icon-badge-cyan">
                  <i className={`fa-solid ${report.icon} icon-cyan icon-lg`}></i>
                </div>
                <h3 style={{ marginBottom: '0.4rem' }}>{report.title}</h3>
                <p style={{ fontSize: '0.875rem' }}>{report.desc}</p>
              </a>
            ))}
          </div>
        </div>

      </div>
    </ProtectedRoute>
  );
}