'use client';

import { useState } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { useAuth } from '@/app/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────

type NotifCategory = 'all' | 'security' | 'system' | 'governance';

interface Notification {
  id: number;
  title: string;
  desc: string;
  time: string;
  icon: string;
  category: NotifCategory;
  read: boolean;
}

// ── Static notifications (replace with API call when backend is ready) ─────

const INITIAL: Notification[] = [
  {
    id: 1,
    title: 'Password changed',
    desc: 'Your account password was updated successfully.',
    time: '1d ago',
    icon: 'fa-key',
    category: 'security',
    read: false,
  },
  {
    id: 2,
    title: 'Login from new session',
    desc: 'A new session was started from your account.',
    time: '2d ago',
    icon: 'fa-right-to-bracket',
    category: 'security',
    read: true,
  },
  {
    id: 3,
    title: 'Governance policy updated',
    desc: 'Attendance metrics caveat has been revised by an administrator.',
    time: '3d ago',
    icon: 'fa-scale-balanced',
    category: 'governance',
    read: true,
  },
  {
    id: 4,
    title: 'Pipeline completed',
    desc: 'Daily data pipeline finished successfully with no validation failures.',
    time: '3d ago',
    icon: 'fa-circle-check',
    category: 'system',
    read: true,
  },
  {
    id: 5,
    title: 'GitHub sync completed',
    desc: 'SS04-git/git_repo_con was synced — 6 PRs and 9 commits updated.',
    time: '4d ago',
    icon: 'fa-code-branch',
    category: 'system',
    read: true,
  },
];

const CATEGORY_LABELS: Record<NotifCategory, string> = {
  all:        'All',
  security:   'Security',
  system:     'System',
  governance: 'Governance',
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  security:   { bg: 'rgba(244,63,94,0.08)',   color: '#f43f5e' },
  system:     { bg: 'rgba(6,182,212,0.08)',    color: '#06b6d4' },
  governance: { bg: 'rgba(245,158,11,0.08)',   color: '#f59e0b' },
};

// ── Page ──────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL);
  const [filter, setFilter] = useState<NotifCategory>('all');

  const unread = notifications.filter(n => !n.read).length;

  const visible = filter === 'all'
    ? notifications
    : notifications.filter(n => n.category === filter);

  const markAllRead = () =>
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const markRead = (id: number) =>
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  const dismiss = (id: number) =>
    setNotifications(prev => prev.filter(n => n.id !== id));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.45rem 1rem',
    border: 'none',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: active ? 700 : 500,
    background: active
      ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
      : 'transparent',
    color: active ? 'white' : 'var(--text-muted)',
    boxShadow: active ? '0 3px 10px rgba(6,182,212,.28)' : 'none',
    transition: 'all 0.15s',
    transform: 'none',
  });

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav />

        <div className="page-body">

          {/* Header */}
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h1>Notifications</h1>
                <p>{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
              </div>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600,
                    padding: '0.45rem 1rem', borderRadius: '8px',
                    boxShadow: 'none', transform: 'none', marginTop: '0.5rem',
                  }}
                >
                  <i className="fa-solid fa-check-double" style={{ marginRight: '0.4rem' }} />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: 'flex', gap: '0.3rem', padding: '0.35rem',
            background: 'rgba(255,255,255,0.6)', borderRadius: '999px',
            border: '1px solid var(--border)', marginBottom: '1.25rem',
            width: 'fit-content', backdropFilter: 'blur(8px)',
          }}>
            {(Object.keys(CATEGORY_LABELS) as NotifCategory[]).map(cat => (
              <button key={cat} style={tabStyle(filter === cat)} onClick={() => setFilter(cat)}>
                {CATEGORY_LABELS[cat]}
                {cat === 'all' && unread > 0 && (
                  <span style={{
                    marginLeft: '0.4rem', background: '#f43f5e', color: 'white',
                    borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700,
                    padding: '0.1rem 0.45rem', display: 'inline-block', lineHeight: 1.4,
                  }}>
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {visible.length === 0 ? (
              <div className="card card-static" style={{ padding: '3rem', textAlign: 'center' }}>
                <i className="fa-solid fa-bell-slash" style={{ fontSize: '1.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'block' }} />
                <p style={{ margin: 0 }}>No {filter !== 'all' ? filter : ''} notifications</p>
              </div>
            ) : visible.map(notif => {
              const cat = CATEGORY_COLORS[notif.category] ?? { bg: 'rgba(6,182,212,0.08)', color: '#06b6d4' };
              return (
                <div
                  key={notif.id}
                  className="card card-static"
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex', alignItems: 'flex-start', gap: '1rem',
                    opacity: notif.read ? 0.75 : 1,
                    borderLeft: notif.read ? undefined : '3px solid #06b6d4',
                    cursor: notif.read ? 'default' : 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onClick={() => !notif.read && markRead(notif.id)}
                >
                  {/* Icon */}
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                    background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`fa-solid ${notif.icon}`} style={{ color: cat.color, fontSize: '0.9rem' }} />
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: notif.read ? 500 : 700 }}>
                        {notif.title}
                      </strong>
                      {!notif.read && (
                        <span style={{
                          width: '7px', height: '7px', borderRadius: '50%',
                          background: '#06b6d4', display: 'inline-block', flexShrink: 0,
                        }} />
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>{notif.desc}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 600, textTransform: 'capitalize',
                        padding: '0.15rem 0.55rem', borderRadius: '999px',
                        background: cat.bg, color: cat.color,
                      }}>
                        {notif.category}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>{notif.time}</span>
                    </div>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={e => { e.stopPropagation(); dismiss(notif.id); }}
                    style={{
                      background: 'none', border: 'none', boxShadow: 'none',
                      color: 'var(--text-muted)', padding: '0.2rem', cursor: 'pointer',
                      borderRadius: '6px', opacity: 0.5, transform: 'none',
                      flexShrink: 0, fontSize: '0.8rem',
                    }}
                    title="Dismiss"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}