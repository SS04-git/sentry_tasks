'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

interface SecurityMetric {
person_id: string;
denied_count: number;
total_events: number;
denied_rate_pct: number;
}

interface ImbalanceMetric {
person_id: string;
entry_count: number;
exit_count: number;
imbalance_score: number;
}

interface QueueItem {
id: string;
event_id: string;
person_id: string;
score: number;
reason: string;
status: string;
created_at: string;
event_ts: string;
direction: string;
access_result: string;
full_name: string | null;
}

export default function SecurityPage() {
const { user, logout } = useAuth();

const role = user?.role ?? 'employee';

const [profileOpen, setProfileOpen] = useState(false);
const profileRef = useRef<HTMLDivElement>(null);

const [loading, setLoading] = useState(true);

const [deniedAccess, setDeniedAccess] = useState<SecurityMetric[]>([]);
const [imbalance, setImbalance] = useState<ImbalanceMetric[]>([]);
const [queue, setQueue] = useState<QueueItem[]>([]);

const didLoad = useRef(false);

useEffect(() => {
const h = (e: MouseEvent) => {
if (
profileRef.current &&
!profileRef.current.contains(e.target as Node)
) {
setProfileOpen(false);
}
};

document.addEventListener('mousedown', h);

return () =>
  document.removeEventListener('mousedown', h);


}, []);

useEffect(() => {
  if (didLoad.current) return;
  didLoad.current = true;
  loadData();
}, []);

const loadData = async () => {
  try {
    const token = getToken();

    const metrics = await fetchWithAuth('api/v1/security/metrics', token!);
    const queueData = await fetchWithAuth('api/v1/security/queue', token!);
    // ↑ removed the stray fetchWithAuth(`.../${id}/${action}`) line — it doesn't belong here

    setDeniedAccess(metrics.denied_access || []);
    setImbalance(metrics.entry_exit_imbalance || []);
    setQueue(queueData?.data ?? []);
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};

const handleReview = async (
  id: string,
  action: 'confirm' | 'dismiss'
) => {
  try {
    const token = getToken();

    await fetchWithAuth(
      `api/v1/security/queue/${id}/${action}`,  // ← removed leading slash
      token!,
      { method: 'POST' }
    );

    setQueue((prev) => prev.filter((item) => item.id !== id));
  } catch (err) {
    console.error(err);
    alert('Failed to update review');
  }
};

const totalDenied = deniedAccess.reduce(
(sum, row) => sum + row.denied_count,
0
);

const highRiskUsers = deniedAccess.filter(
(r) => r.denied_rate_pct > 20
).length;

const thStyle = {
  padding: '0.85rem 1.25rem',
  textAlign: 'center' as const,
  fontWeight: 600,
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)',
  background: 'rgba(6,182,212,0.04)',
};

const tdStyle = {
  padding: '0.85rem 1.25rem',
  textAlign: 'center' as const,
  borderBottom: '1px solid var(--border)',
};

return ( <ProtectedRoute> <div className="page">


    {/* NAV */}

    <nav className="nav">
      <div className="nav-inner">

        <div className="nav-logo">
          <div className="nav-logo-icon">
            <i className="fa-solid fa-shield-halved icon-white icon-md"></i>
          </div>
          <span className="nav-logo-text">
            Sentry
          </span>
        </div>

        <div className="nav-links">
          <a
            href="/dashboard"
            className="nav-link"
          >
            <i
              className="fa-solid fa-gauge icon-sm"
              style={{
                marginRight: '0.4rem',
              }}
            ></i>
            Dashboard
          </a>

          {[
            'admin',
            'leadership',
            'manager',
          ].includes(role) && (
            <a
              href="/reports"
              className="nav-link"
            >
              <i
                className="fa-solid fa-chart-bar icon-sm"
                style={{
                  marginRight: '0.4rem',
                }}
              ></i>
              Reports
            </a>
          )}

          {[
            'admin',
            'leadership',
          ].includes(role) && (
            <a
              href="/admin"
              className="nav-link active"
            >
              <i
                className="fa-solid fa-screwdriver-wrench icon-sm"
                style={{
                  marginRight: '0.4rem',
                }}
              ></i>
              Admin
            </a>
          )}
        </div>

        <div className="nav-user">
          <div className="nav-notification">
            <i className="fa-solid fa-bell icon-cyan"></i>
          </div>

          <div
            className="profile-trigger"
            ref={profileRef}
            onClick={() =>
              setProfileOpen(!profileOpen)
            }
          >
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

      {/* Breadcrumb */}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          fontSize: '0.82rem',
        }}
      >
        <a
          href="/admin"
          style={{
            textDecoration: 'none',
            color: 'var(--text-muted)',
          }}
        >
          Admin
        </a>

        <i className="fa-solid fa-chevron-right"></i>

        <span
          style={{
            fontWeight: 600,
          }}
        >
          Security
        </span>
      </div>

      {/* Header */}

      <div className="page-header">
        <h1>Security Dashboard</h1>
        <p>
          Monitor denied access activity,
          occupancy anomalies and review
          flagged security events.
        </p>
      </div>

      {loading ? (
        <div
          className="card card-static"
          style={{ padding: '2rem' }}
        >
          Loading security data...
        </div>
      ) : (
        <>

          {/* KPI CARDS */}

          <div
            className="stats-grid"
            style={{
              marginBottom: '2rem',
            }}
          >
            {[
              {
                label:
                  'Denied Access Events',
                value: totalDenied,
                icon:
                  'fa-circle-exclamation',
              },
              {
                label: 'Review Queue',
                value: queue.length,
                icon: 'fa-list-check',
              },
              {
                label:
                  'High Risk Users',
                value: highRiskUsers,
                icon: 'fa-user-shield',
              },
              {
                label:
                  'Tracked People',
                value:
                  deniedAccess.length,
                icon: 'fa-users',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="card stat-card"
              >
                <div className="stat-top">
                  <div className="icon-badge icon-badge-cyan">
                    <i
                      className={`fa-solid ${item.icon} icon-cyan`}
                    ></i>
                  </div>
                </div>

                <div className="stat-value">
                  {item.value}
                </div>

                <div className="stat-label">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* DENIED ACCESS */}

          {/* DENIED ACCESS */}

<div
  className="card card-static"
  style={{
    padding: 0,
    marginBottom: '1.5rem',
  }}
>
  <div
    style={{
      padding: '1.25rem 1.5rem',
      borderBottom: '1px solid var(--border)',
    }}
  >
    <h2 style={{ margin: 0 }}>
      Denied Access Rates
    </h2>
  </div>

  <div style={{ overflowX: 'auto' }}>
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <thead>
        <tr>
          <th style={thStyle}>Person</th>
          <th style={thStyle}>Denied</th>
          <th style={thStyle}>Total</th>
          <th style={thStyle}>Rate</th>
        </tr>
      </thead>

      <tbody>
        {deniedAccess.map((row) => (
          <tr key={row.person_id}>
            <td style={tdStyle}>{row.person_id}</td>
            <td style={tdStyle}>{row.denied_count}</td>
            <td style={tdStyle}>{row.total_events}</td>
            <td style={tdStyle}>
              {row.denied_rate_pct}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

{/* ENTRY / EXIT IMBALANCE */}

<div
  className="card card-static"
  style={{
    padding: 0,
    marginBottom: '1.5rem',
  }}
>
  <div
    style={{
      padding: '1.25rem 1.5rem',
      borderBottom: '1px solid var(--border)',
    }}
  >
    <h2 style={{ margin: 0 }}>
      Entry / Exit Imbalance
    </h2>
  </div>

  <div style={{ overflowX: 'auto' }}>
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <thead>
        <tr>
          <th style={thStyle}>Person</th>
          <th style={thStyle}>Entries</th>
          <th style={thStyle}>Exits</th>
          <th style={thStyle}>Imbalance</th>
        </tr>
      </thead>

      <tbody>
        {imbalance.map((row) => (
          <tr key={row.person_id}>
            <td style={tdStyle}>{row.person_id}</td>
            <td style={tdStyle}>{row.entry_count}</td>
            <td style={tdStyle}>{row.exit_count}</td>
            <td style={tdStyle}>
              {row.imbalance_score}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

{/* REVIEW QUEUE */}

<div
  className="card card-static"
  style={{
    padding: 0,
  }}
>
  <div
    style={{
      padding: '1.25rem 1.5rem',
      borderBottom: '1px solid var(--border)',
    }}
  >
    <h2 style={{ margin: 0 }}>
      Review Queue
    </h2>
  </div>

  <div style={{ overflowX: 'auto' }}>
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <thead>
        <tr>
          <th style={thStyle}>Person</th>
          <th style={thStyle}>Score</th>
          <th style={thStyle}>Reason</th>
          <th style={thStyle}>Direction</th>
          <th style={thStyle}>Result</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>

      <tbody>
        {queue.map((item) => (
          <tr key={item.id}>
            <td style={tdStyle}>
              {item.full_name ?? item.person_id}
            </td>

            <td style={tdStyle}>
              {Number(item.score ?? 0).toFixed(2)}
            </td>

            <td style={tdStyle}>
              {item.reason}
            </td>

            <td style={tdStyle}>
              {item.direction}
            </td>

            <td style={tdStyle}>
              {item.access_result}
            </td>

            <td style={tdStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <button
                  className="btn-primary"
                  onClick={() =>
                    handleReview(
                      item.id,
                      'confirm'
                    )
                  }
                >
                  Confirm
                </button>

                <button
                  className="btn-secondary"
                  onClick={() =>
                    handleReview(
                      item.id,
                      'dismiss'
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
            </td>
          </tr>
        ))}

        {queue.length === 0 && (
          <tr>
            <td
              colSpan={6}
              style={{
                textAlign: 'center',
                padding: '2rem',
              }}
            >
              No flagged events awaiting review
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>
        </>
      )}
    </div>
  </div>
</ProtectedRoute>


);
}
