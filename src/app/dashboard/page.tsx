'use client';

import { useState, useRef, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';
import PageNav from '../components/PageNav';
import { KpiCaveat } from '@/app/components/KpiCaveat';

interface AuditLog {
  id: number;
  action: string;
  performed_by: string;
  target_user: string | null;
  detail: string | null;
  created_at: string;
}

interface AttendancePreview {
  own: {
    days_present: number;
    attendance_pct: number;
    avg_arrival: string | null;
    avg_session_hours: number;
    days_this_week: number;
  };
  cohort: {
    size: number;
    avg_attendance_pct: number | null;
    avg_session_hours: number | null;
  };
}

interface PreviewNotification {
  id: string;
  title: string;
  desc: string;
  time: string;
  icon: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Subset of action -> display meta, mirrors notifications/page.tsx.
// Keep these two in sync if you add new audit action types.
const ACTION_META: Record<string, { title: string; desc: (target: string, detail: string) => string; icon: string }> = {
  create_user:     { title: 'User Created',     desc: (t) => `${t} was added to the system.`, icon: 'fa-user-plus' },
  update_user:      { title: 'User Updated',     desc: (t) => `${t}'s profile was updated.`,   icon: 'fa-user-pen' },
  disable_user:     { title: 'User Disabled',    desc: (t) => `${t}'s account was disabled.`,  icon: 'fa-user-slash' },
  enable_user:      { title: 'User Enabled',     desc: (t) => `${t}'s account was re-enabled.`,icon: 'fa-user-check' },
  assign_role:      { title: 'Role Changed',     desc: (t, d) => `${t}'s role was changed. ${d}`, icon: 'fa-id-badge' },
  change_password:  { title: 'Password Changed', desc: (t) => `Password was changed for ${t}.`, icon: 'fa-key' },
  update_profile:   { title: 'Profile Updated',  desc: (t, d) => `${t}'s profile was updated. ${d}`, icon: 'fa-user-pen' },
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const canViewIndividualMetrics =
  role === 'admin' ||
  role === 'leadership';
  // Attendance preview visibility: employees can't see it at all;
  // managers see a limited view (no avg arrival / team avg / KPI breakdown);
  // admin & leadership see the full detail.
  const canViewAttendance = role === 'admin' || role === 'leadership' || role === 'manager';
  const canViewFullAttendance = role === 'admin' || role === 'leadership';
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [activeUsers, setActiveUsers] = useState<number | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [attendance, setAttendance] = useState<AttendancePreview | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [caveats, setCaveats] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<PreviewNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const unreadCount = notifications.length;

  const teamMembers = [
    { name: 'Nancy',   role: 'Manager',  status: 'online'  },
    { name: 'Rahul',   role: 'Employee', status: 'online'  },
    { name: 'Alice',   role: 'Employee', status: 'offline' },
    { name: 'Nirmala', role: 'Employee', status: 'offline' },
    { name: 'Samuel',  role: 'Employee', status: 'online'  },
  ];

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
      if (['admin', 'leadership'].includes(role)) {
        const users = await fetchWithAuth('api/v1/users/', token);
        setActiveUsers(users.filter((u: { is_active: boolean }) => u.is_active).length);

        const countData = await fetchWithAuth('api/v1/users/audit-logs/count', token);
        setAuditCount(countData.count);

        const logs: AuditLog[] = await fetchWithAuth('api/v1/users/audit-logs?limit=3', token);
        setRecentLogs(logs.slice(0, 3));

        console.log('audit logs raw:', logs); 
        console.log('role is:', role);         
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoadingStats(false);
    }
  };
  loadDashboardData();
}, [role]);

useEffect(() => {
  const loadAttendance = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data: AttendancePreview = await fetchWithAuth('api/v1/attendance/preview', token);
      setAttendance(data);
      console.log('attendance raw:', data);                                              // ← here
      console.log('days_this_week:', data?.own?.days_this_week, typeof data?.own?.days_this_week); // ← here
    } catch (err) {
      console.error('Failed to load attendance preview', err);
    } finally {
      setLoadingAttendance(false);
    }
  };
  loadAttendance();
}, []);

  useEffect(() => {
  const load = async () => {
    const token = getToken();
    if (!token) return;
    const data = await fetchWithAuth('api/v1/governance/caveats', token);
    setCaveats(data);
  };
  load();
}, []);

  useEffect(() => {
  const loadNotifications = async () => {
    const token = getToken();
    if (!token) return;
    const built: PreviewNotification[] = [];
    const seenIds = new Set<string>();

    const pushLog = (prefix: string, log: any) => {
      const meta = ACTION_META[log.action];
      if (!meta) return;
      const id = `${prefix}-${log.id}`;
      if (seenIds.has(id)) return;
      seenIds.add(id);
      built.push({
        id,
        title: meta.title,
        desc: meta.desc(log.target_user ?? '', log.detail ?? ''),
        time: timeAgo(log.created_at),
        icon: meta.icon,
        created_at: log.created_at,
      });
    };

    // Own account activity — visible to everyone, mirrors notifications page.
    try {
      const ownLogs = await fetchWithAuth('api/v1/users/audit-logs/me', token);
      if (Array.isArray(ownLogs)) {
        ownLogs.slice(0, 10).forEach((log: any) => pushLog('own', log));
      }
    } catch { /* self audit trail not available — skip */ }

    // Full audit log — admin/leadership only.
    if (['admin', 'leadership'].includes(role)) {
      try {
        const logs = await fetchWithAuth('api/v1/users/audit-logs', token);
        if (Array.isArray(logs)) {
          logs.slice(0, 10).forEach((log: any) => pushLog('audit', log));
        }
      } catch { /* audit logs not available — skip */ }
    }

    // GitHub sync events.
    try {
      const syncStatus = await fetchWithAuth('api/v1/github/sync-status', token);
      if (Array.isArray(syncStatus?.repos)) {
        syncStatus.repos.forEach((r: any) => {
          if (r.last_sync_at) {
            const isError = r.status === 'error';
            built.push({
              id: `sync-${r.repo}`,
              title: isError ? `Sync failed: ${r.repo}` : `Sync completed: ${r.repo}`,
              desc: isError
                ? `Error: ${r.error ?? 'unknown'}`
                : `${r.commits_synced ?? 0} commits · ${r.prs_synced ?? 0} PRs updated.`,
              time: timeAgo(r.last_sync_at),
              icon: isError ? 'fa-circle-xmark' : 'fa-code-branch',
              created_at: r.last_sync_at,
            });
          }
        });
      }
    } catch { /* GitHub not connected — skip */ }

    // Sort newest-first, keep only the most recent for the preview card.
    built.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setNotifications(built.slice(0, 1));
    setLoadingNotifications(false);
  };
  loadNotifications();
}, [role]);

  const stats = [
    {
      label: 'Active Users',
      value: ['admin', 'leadership'].includes(role) ? (activeUsers ?? '—') : '—',
      icon: 'fa-users',
      trend: '',
    },
    {
      label: 'Audit Events',
      value: ['admin', 'leadership'].includes(role) ? (auditCount ?? '—') : '—',
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

  const actionMeta: Record<string, { title: string; desc: (l: AuditLog) => string }> = {
    create_user:  { title: 'User Created',  desc: (l) => `${l.target_user} was added` },
    update_user:  { title: 'User Updated',  desc: (l) => `${l.target_user} was updated` },
    disable_user: { title: 'User Disabled', desc: (l) => `${l.target_user} was disabled` },
    enable_user:  { title: 'User Enabled',  desc: (l) => `${l.target_user} was enabled` },
    assign_role:  { title: 'Role Changed',  desc: (l) => `${l.target_user}: ${l.detail ?? ''}` },
  };

  // Attendance bar helper
  const AttendanceBar = ({ pct, color }: { pct: number; color: string }) => (
    <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-alt)', overflow: 'hidden', marginTop: '0.4rem' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width 0.6s ease' }} />
    </div>
  );

  const weekDays = ['M', 'T', 'W', 'T', 'F'];
  const daysThisWeek = attendance?.own?.days_this_week ?? 0;

  return (
    <ProtectedRoute>
      <div className="page">

        <PageNav active="dashboard" />

        <div className="page-body">

          {/* Top banner + user card */}
          <div className="dashboard-top">
            <div className="banner">
              <div>
                <p className="banner-label">
                  <i className="fa-solid fa-hand-wave"></i>
                  Welcome back
                </p>
                <h1 className="banner-title">{user?.email?.split('@')[0]}</h1>
                <p className="banner-subtitle">Operational insights with governance controls</p>
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
              <div className="user-name">{user?.email?.split('@')[0]}</div>
              <div className="user-role">{role}</div>
              <div className="user-status">
                <span className="status-dot"></span>
                Active Session
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="card stat-card" key={stat.label}>
                <div className="stat-top">
                  <div className="icon-badge icon-badge-cyan">
                    <i className={`fa-solid ${stat.icon} icon-cyan`}></i>
                  </div>
                  {stat.trend && <div className="stat-trend">{stat.trend}</div>}
                </div>
                <div className="stat-value">
                  {loadingStats && ['admin', 'leadership'].includes(role) && stat.label !== 'Last Login'
                    ? <i className="fa-solid fa-spinner fa-spin"></i>
                    : stat.value}
                </div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Main grid */}
          <div className="dashboard-grid">

            {/* Left column */}
            <div className="dashboard-column">


              {/* ── Attendance Preview Card ── */}
              {canViewAttendance && (
              <div className="card">
                <div className="section-header" style={{ marginBottom: '1.25rem' }}>
                  <i className="fa-solid fa-calendar-check icon-cyan"></i>
                  <h2>My Attendance</h2>
                  {role === 'admin' && (
                    <a
                      href="/admin/attendance"
                      style={{
                        marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600,
                        color: 'var(--accent)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                      }}
                    >
                      Full report <i className="fa-solid fa-arrow-right" style={{ fontSize: '12px' }}></i>
                    </a>
                  )}
                </div>

                {loadingAttendance ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                    <i className="fa-solid fa-spinner fa-spin icon-cyan"></i>
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading attendance…</p>
                  </div>
                ) : !attendance ? (
                  <p style={{ fontSize: '0.875rem' }}>No attendance data available.</p>
                ) : (
                  <>
                    {/* This-week dots */}
                    <div style={{ marginBottom: '1.25rem' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        This week
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {weekDays.map((d, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '8px',
                              background: i < daysThisWeek
                                ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                                : 'var(--surface-alt)',
                              border: i < daysThisWeek ? 'none' : '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {i < daysThisWeek && (
                                <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '12px' }}></i>
                              )}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* KPIs — admin & leadership only */}
                    {canViewFullAttendance && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                      {[
                        {
                          label: 'Attendance rate',
                          value: `${attendance.own.attendance_pct ?? 0}%`,
                          sub: '30-day window',
                          pct: attendance.own.attendance_pct ?? 0,
                          color: attendance.own.attendance_pct >= 80 ? '#10b981' : attendance.own.attendance_pct >= 60 ? '#f59e0b' : '#f43f5e',
                        },
                        {
                          label: 'Avg session',
                          value: `${attendance.own.avg_session_hours?.toFixed(1) ?? '—'}h`,
                          sub: 'per day',
                          pct: Math.min((attendance.own.avg_session_hours / 10) * 100, 100),
                          color: '#06b6d4',
                        },
                      ].map((kpi) => (
                        <div key={kpi.label} style={{ padding: '0.85rem', borderRadius: '12px', background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{kpi.value}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{kpi.label}</div>
                          { kpi.label === 'Attendance rate' && (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                              Presence data should not be used as a performance score.
                            </p>)}
                          <AttendanceBar pct={kpi.pct} color={kpi.color} />
                        </div>
                      ))}
                    </div>
                    )}

                    {/* Arrival + cohort comparison */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {canViewFullAttendance && (
                      <div className="info-row" style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="info-row-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <i className="fa-solid fa-clock icon-cyan" style={{ fontSize: '0.8rem' }}></i>
                          Avg arrival
                        </span>
                        <span className="info-row-value">{attendance.own.avg_arrival ?? '—'}</span>
                      </div>
                      )}
                      <div className="info-row" style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="info-row-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <i className="fa-solid fa-calendar-days icon-cyan" style={{ fontSize: '0.8rem' }}></i>
                          Days present
                        </span>
                        <span className="info-row-value">{attendance.own.days_present} / 30 days</span>
                      </div>
                      {canViewFullAttendance && attendance.cohort.avg_attendance_pct !== null && (
                        <div className="info-row" style={{ padding: '0.6rem 0' }}>
                          <span className="info-row-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <i className="fa-solid fa-users icon-cyan" style={{ fontSize: '0.8rem' }}></i>
                            Team avg
                          </span>
                          <span className="info-row-value">{attendance.cohort.avg_attendance_pct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Privacy caveat */}
                    {canViewFullAttendance && attendance.cohort.avg_attendance_pct === null && (
                      <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '0.75rem', fontStyle: 'italic' }}>
                        Team comparison hidden — cohort too small.
                      </p>
                    )}
                    <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '1rem', fontStyle: 'italic'}}>
                      Attendance metrics reflect workplace presence only and do not represent productivity, impact, or employee performance.
                    </p>
                  </>
                )}
              </div>
              )}

              {/* Permissions */}
              <div className="card">
                <div className="section-header">
                  <i className="fa-solid fa-key icon-cyan"></i>
                  <h2>Permissions</h2>
                </div>
                <div className="access-grid">
                  {[
                    { label: 'Dashboard',    icon: 'fa-gauge',              roles: ['admin','leadership','manager','employee'] },
                    { label: 'Reports',      icon: 'fa-chart-bar',          roles: ['admin','leadership','manager'] },
                    { label: 'Admin',        icon: 'fa-screwdriver-wrench', roles: ['admin'] },
                    { label: 'Manage Users', icon: 'fa-users-gear',         roles: ['admin'] },
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

              {/* Governance Ops */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="section-header">
              <i className="fa-solid fa-scale-balanced icon-cyan"></i>
              <h2>Governance Notice</h2>
            </div>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            Attendance, occupancy and GitHub activity are reported separately.
            Presence is not a measure of performance and no combined employee
            score is calculated.
            </p>
            <KpiCaveat text={caveats['attendance']} />
            <KpiCaveat text={caveats['commit_count']} />
            </div>

            </div>

            {/* Right column */}
            <div className="dashboard-column">

              {/* Notifications */}
              <div className="card">
                <div className="section-header">
                  <i className="fa-solid fa-bell icon-cyan"></i>
                  <h2>Recent Notifications</h2>
                  <a href="/notifications" style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                   View all <i className="fa-solid fa-arrow-right" style={{ fontSize: '12px' }} /></a>    
                </div>
                {loadingNotifications ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                    <i className="fa-solid fa-spinner fa-spin icon-cyan"></i>
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading…</p>
                  </div>
                ) : notifications.length > 0 ? (
                  <div className="notification-single">
                    <i className={`fa-solid ${notifications[0].icon} icon-cyan notification-single-icon`}></i>
                    <div className="notification-single-body">
                      <strong>{notifications[0].title}</strong>
                      <p>{notifications[0].desc}</p>
                    </div>
                    <span className="notification-time">{notifications[0].time}</span>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem' }}>No new notifications</p>
                )}
              </div>

              {/* Team — admin only */}
              {canViewIndividualMetrics && (
                <div className="card">
                  <div className="section-header">
                    <i className="fa-solid fa-people-group icon-cyan"></i>
                    <h2>Team</h2>
                  </div>
                  <div className="team-list">
                    {teamMembers.map((member) => (
                      <div className="team-item" key={member.name}>
                        <div className="team-avatar">
                          <i className="fa-solid fa-user"></i>
                          <span className={`team-status-dot ${member.status}`}></span>
                        </div>
                        <div className="team-info">
                          <strong>{member.name}</strong>
                          <p>{member.role}</p>
                        </div>
                        <span className={`team-status-label ${member.status}`}>
                          {member.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent security activity */}
              <div className="card">
                <div className="section-header">
                  <i className="fa-solid fa-clock-rotate-left icon-cyan"></i>
                  <h2>Recent Security Activity</h2>
                </div>
                <div className="activity-list">
                  {canViewIndividualMetrics ? (
                    recentLogs.length > 0 ? (
                      recentLogs.map((log) => {
                        const meta = actionMeta[log.action] ?? { title: log.action, desc: () => log.detail ?? '' };
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
                    <p style={{ fontSize: '0.875rem' }}>Activity logs are visible to admin and leadership roles only.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}