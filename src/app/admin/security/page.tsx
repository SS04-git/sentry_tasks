'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';
import PageNav from '@/app/components/PageNav';

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

    if (!token) {
      console.error("No auth token found");
      return;
    }

    const metrics = await fetchWithAuth(
      '/api/v1/security/metrics',
      token
    );

    const queueData = await fetchWithAuth(
      '/api/v1/security/queue',
      token
    );

    setDeniedAccess(metrics.denied_access || []);
    setImbalance(metrics.entry_exit_imbalance || []);
    setQueue(Array.isArray(queueData.data) ? queueData.data : []);
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

return ( <ProtectedRoute> <div className="page">

<PageNav active="admin" />

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
          <div className="card card-static" style={{ marginBottom: '1.5rem' }}>
  <h2>Denied Access Rates</h2>

  <div className="table-container">
    <table>
      <thead>
        <tr>
          <th>Person</th>
          <th className="table-number">Denied</th>
          <th className="table-number">Total</th>
          <th className="table-number">Rate</th>
        </tr>
      </thead>

      <tbody>
        {deniedAccess.length > 0 ? (
          deniedAccess.map((row) => (
            <tr key={row.person_id}>
              <td>{row.person_id}</td>
              <td className="table-number">
                {row.denied_count}
              </td>
              <td className="table-number">
                {row.total_events}
              </td>
              <td className="table-number">
                {row.denied_rate_pct}%
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td
              colSpan={4}
              style={{
                textAlign: 'center',
                color: '#888',
                padding: '1rem',
              }}
            >
              No denied access data available
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>

        {/* ENTRY / EXIT IMBALANCE */}
        <div className="card card-static" style={{ marginBottom: '1.5rem' }}>
  <h2>Entry / Exit Imbalance</h2>

  <div className="table-container">
    <table>
      <thead>
        <tr>
          <th>Person</th>
          <th className="table-number">Entries</th>
          <th className="table-number">Exits</th>
          <th className="table-number">Imbalance</th>
        </tr>
      </thead>

      <tbody>
        {imbalance.length > 0 ? (
          imbalance.map((row) => (
            <tr key={row.person_id}>
              <td>{row.person_id}</td>
              <td className="table-number">
                {row.entry_count}
              </td>
              <td className="table-number">
                {row.exit_count}
              </td>
              <td className="table-number">
                {row.imbalance_score}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td
              colSpan={4}
              style={{
                textAlign: 'center',
                color: '#888',
                padding: '1rem',
              }}
            >
              No imbalance data available
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>


    {/* REVIEW QUEUE */}
    <div className="card card-static">
  <h2>Review Queue</h2>

  <div className="table-container">
    <table>
      <thead>
        <tr>
          <th>Person</th>
          <th className="table-number">Score</th>
          <th>Reason</th>
          <th>Direction</th>
          <th>Result</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        {queue.length > 0 ? (
          queue.map((item) => (
            <tr key={item.id}>
              <td>
                {item.full_name ?? item.person_id}
              </td>

              <td className="table-number">
                {Number(item.score ?? 0).toFixed(2)}
              </td>

              <td>{item.reason}</td>

              <td>{item.direction}</td>

              <td>{item.access_result}</td>

              <td>
                <div
                  style={{
                    display: 'flex',
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
          ))
        ) : (
          <tr>
            <td
              colSpan={6}
              style={{
                textAlign: 'center',
                color: '#888',
                padding: '1rem',
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
