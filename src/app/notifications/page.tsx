'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

type NotifCategory = 'all' | 'security' | 'system' | 'governance';

interface Notification {
  id: string;
  title: string;
  desc: string;
  time: string;
  icon: string;
  category: NotifCategory;
  read: boolean;
}

const CATEGORY_LABELS: Record<NotifCategory, string> = {
  all: 'All', security: 'Security', system: 'System', governance: 'Governance',
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  security:   { bg: 'rgba(244,63,94,0.08)',  color: '#f43f5e' },
  system:     { bg: 'rgba(6,182,212,0.08)',   color: '#06b6d4' },
  governance: { bg: 'rgba(245,158,11,0.08)',  color: '#f59e0b' },
};

// NOTE: `change_password` and `update_profile` are guesses at the backend
// action names. Confirm the real `log.action` values your API writes for
// self-service password changes / name edits / role changes and rename
// these keys to match — otherwise those events will be silently dropped
// (same as any action string not present in this map).
const ACTION_META: Record<string, { title: string; desc: (target: string, detail: string) => string; icon: string; category: NotifCategory }> = {
  create_user:      { title: 'User Created',      desc: (t) => `${t} was added to the system.`,            icon: 'fa-user-plus',   category: 'security' },
  update_user:       { title: 'User Updated',      desc: (t) => `${t}'s profile was updated.`,              icon: 'fa-user-pen',    category: 'security' },
  disable_user:      { title: 'User Disabled',     desc: (t) => `${t}'s account was disabled.`,             icon: 'fa-user-slash',  category: 'security' },
  enable_user:       { title: 'User Enabled',      desc: (t) => `${t}'s account was re-enabled.`,           icon: 'fa-user-check',  category: 'security' },
  assign_role:       { title: 'Role Changed',      desc: (t, d) => `${t}'s role was changed. ${d}`,         icon: 'fa-id-badge',    category: 'security' },
  change_password:   { title: 'Password Changed',  desc: (t) => `Password was changed for ${t}.`,           icon: 'fa-key',         category: 'security' },
  update_profile:    { title: 'Profile Updated',   desc: (t, d) => `${t}'s profile was updated. ${d}`,      icon: 'fa-user-pen',    category: 'security' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'employee';
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed]         = useState<Set<string>>(new Set());
  const [readSet, setReadSet]             = useState<Set<string>>(new Set());
  const [filter, setFilter]               = useState<NotifCategory>('all');
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = getToken();
      if (!token) return;
      const built: Notification[] = [];
      const seenIds = new Set<string>();

      const pushLog = (prefix: string, log: any) => {
        const meta = ACTION_META[log.action];
        if (!meta) return;
        const id = `${prefix}-${log.id}`;
        if (seenIds.has(id)) return; // avoid dupes if self + admin fetches overlap
        seenIds.add(id);
        built.push({
          id,
          title:    meta.title,
          desc:     meta.desc(log.target_user ?? '', log.detail ?? ''),
          time:     timeAgo(log.created_at),
          icon:     meta.icon,
          category: meta.category,
          read:     false,
        });
      };

      // ── Security: everyone's own account activity ────────────────────────
      // Password changes, name/profile edits, and role changes that happen
      // to *your own* account should show up regardless of role. This was
      // previously gated behind admin/leadership, so employees never saw
      // notifications about their own profile changes.
      try {
        const ownLogs = await fetchWithAuth('api/v1/users/audit-logs/me', token);
        if (Array.isArray(ownLogs)) {
          ownLogs.slice(0, 20).forEach((log: any) => pushLog('own', log));
        }
      } catch { /* self audit trail not available — skip */ }

      // ── Security: full audit log (admin/leadership only) ─────────────────
      if (['admin', 'leadership'].includes(role)) {
        try {
          const logs = await fetchWithAuth('api/v1/users/audit-logs', token);
          if (Array.isArray(logs)) {
            logs.slice(0, 20).forEach((log: any) => pushLog('audit', log));
          }
        } catch { /* audit logs not available — skip, don't abort the rest */ }
      }

      // ── System: GitHub sync status ────────────────────────────────────
      try {
        const syncStatus = await fetchWithAuth('api/v1/github/sync-status', token);
        if (Array.isArray(syncStatus?.repos)) {
          syncStatus.repos.forEach((r: any) => {
            if (r.last_sync_at) {
              const isError = r.status === 'error';
              built.push({
                id:       `sync-${r.repo}`,
                title:    isError ? `Sync failed: ${r.repo}` : `Sync completed: ${r.repo}`,
                desc:     isError
                  ? `Error: ${r.error ?? 'unknown'}`
                  : `${r.commits_synced ?? 0} commits · ${r.prs_synced ?? 0} PRs updated.`,
                time:     timeAgo(r.last_sync_at),
                icon:     isError ? 'fa-circle-xmark' : 'fa-code-branch',
                category: 'system',
                read:     false,
              });
            }
          });
        }
      } catch { /* GitHub not connected — skip */ }

      // ── Governance: attendance suppression notice ─────────────────────
      try {
        const preview = await fetchWithAuth('api/v1/attendance/preview', token);
        if (preview?.cohort?.avg_attendance_pct === null) {
          built.push({
            id:       'gov-suppression',
            title:    'Team data suppressed',
            desc:     'Cohort is below 5 members — team-level attendance figures are hidden per governance policy.',
            time:     'now',
            icon:     'fa-scale-balanced',
            category: 'governance',
            read:     false,
          });
        }
      } catch { /* attendance not available — skip */ }

      setNotifications(built);
      setLoading(false);
    };
    load();
  }, [role, user?.email]);

  const visible = notifications
    .filter(n => !dismissed.has(n.id))
    .filter(n => filter === 'all' || n.category === filter)
    .map(n => ({ ...n, read: readSet.has(n.id) }));

  const unread = visible.filter(n => !n.read).length;

  const markRead    = (id: string) => setReadSet(prev => new Set(prev).add(id));
  const markAllRead = () => setReadSet(new Set(visible.map(n => n.id)));
  const dismiss     = (id: string) => setDismissed(prev => new Set(prev).add(id));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.45rem 1rem', border: 'none', borderRadius: '999px',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: active ? 700 : 500,
    background: active ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'transparent',
    color: active ? 'white' : 'var(--text-muted)',
    boxShadow: active ? '0 3px 10px rgba(6,182,212,.28)' : 'none',
    transition: 'all 0.15s', transform: 'none',
  });

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav />
        <div className="page-body">

          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h1>Notifications</h1>
                <p>{loading ? 'Loading…' : unread > 0 ? `${unread} unread` : 'All caught up'}</p>
              </div>
              {unread > 0 && (
                <button
                  type="button"
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
              <button
                type="button"
                key={cat}
                style={tabStyle(filter === cat)}
                onClick={() => setFilter(cat)}
              >
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

          {/* List */}
          {loading ? (
            <div className="card card-static" style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <i className="fa-solid fa-spinner fa-spin icon-cyan" />
              <p style={{ margin: 0 }}>Loading notifications…</p>
            </div>
          ) : (
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
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                      background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <i className={`fa-solid ${notif.icon}`} style={{ color: cat.color, fontSize: '0.9rem' }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <strong style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: notif.read ? 500 : 700 }}>
                          {notif.title}
                        </strong>
                        {!notif.read && (
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#06b6d4', display: 'inline-block', flexShrink: 0 }} />
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

                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); dismiss(notif.id); }}
                      style={{
                        background: 'none', border: 'none', boxShadow: 'none',
                        color: 'var(--text-muted)', padding: '0.2rem', cursor: 'pointer',
                        borderRadius: '6px', opacity: 0.5, transform: 'none',
                        flexShrink: 0, fontSize: '0.8rem',
                      }}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}