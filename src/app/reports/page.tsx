'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';

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
                <a href="/reports" className="nav-link active">
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