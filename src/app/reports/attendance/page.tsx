'use client';

import { useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import PageNav from "@/app/components/PageNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface KpiRow {
  person_id: string;
  full_name: string | null;
  email: string | null;
  user_role: string;
  days_present: number;
  total_working_days: number;
  attendance_pct: number | null;
  avg_arrival: string | null;
  arrival_consistency: number | null;
  avg_session_hours: number | null;
  total_session_hours: number | null;
  is_own: boolean;
}

interface KpiResponse {
  cohort_size: number;
  window_days: number;
  data: KpiRow[];
}

interface TrendPoint {
  week_start: string;
  active_people?: number;
  avg_days_present?: number;
  avg_session_hours: number;
  avg_arrival?: string;
  days_present?: number;
}

interface TrendResponse {
  mode: 'cohort' | 'individual';
  cohort_size?: number;
  suppressed?: boolean;
  data: TrendPoint[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const pctColor = (pct: number | null) => {
  if (pct === null) return '#94a3b8';
  if (pct >= 80) return '#10b981';
  if (pct >= 60) return '#f59e0b';
  return '#f43f5e';
};

const shortWeek = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.96)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '0.8rem',
      boxShadow: '0 4px 20px rgba(15,23,42,0.1)',
    }}>
      <p style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>
        w/c {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color, margin: '0.15rem 0' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function AttendanceReportPage() {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [kpi, setKpi]       = useState<KpiResponse | null>(null);
  const [trend, setTrend]   = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const load = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const [k, t] = await Promise.all([
          fetchWithAuth('api/v1/attendance/kpi', token),
          fetchWithAuth('api/v1/attendance/trend', token),
        ]);
        setKpi(k);
        setTrend(t);
      } catch (e) {
        setError('Failed to load attendance data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Derived
  const cohortAvg = kpi
    ? Math.round(
        kpi.data.reduce((s, r) => s + (r.attendance_pct ?? 0), 0) / (kpi.data.length || 1)
      )
    : null;

  const topAttendee = kpi?.data.reduce(
    (best, r) => (r.attendance_pct ?? 0) > (best?.attendance_pct ?? 0) ? r : best,
    kpi.data[0] ?? null,
  );

  const hasData = !!kpi && kpi.data.length > 0;

  return (
    <ProtectedRoute>
      <div className="page">

        <PageNav active="reports" />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            <a href="/reports" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Reports</a>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.65rem' }}></i>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Attendance</span>
          </div>

          {/* Page header */}
          <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h1>Attendance & Presence</h1>
              <p>30-day rolling window · cohort-framed · data suppressed for groups under 5</p>
            </div>
            {['admin', 'leadership'].includes(role) && (
              <a href="/reports/admin" className="btn btn-primary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }} >
                <i className="fa-solid fa-upload" /> Upload data </a>
            )}
          </div>

          {loading ? (
            <div className="card card-static" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
              <i className="fa-solid fa-spinner fa-spin icon-cyan icon-lg"></i>
              <p style={{ margin: 0 }}>Loading attendance data…</p>
            </div>
          ) : error ? (
            <div className="card card-static" style={{ padding: '2rem', textAlign: 'center' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f43f5e', fontSize: '1.5rem', marginBottom: '0.75rem', display: 'block' }}></i>
              <p>{error}</p>
            </div>
          ) : !hasData ? (
            <div className="card card-static" style={{ padding: '3rem', textAlign: 'center' }}>
              <i className="fa-solid fa-chart-simple" style={{ fontSize: '1.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'block' }}></i>
              <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>No attendance data yet</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                {['admin', 'leadership'].includes(role)
                  ? 'Upload a CSV of access-event records to see attendance stats.'
                  : "Attendance data hasn't been imported yet. Check back once it's uploaded."}
              </p>
              {['admin', 'leadership'].includes(role) && (
                <a href="/reports/admin" className="btn btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                  <i className="fa-solid fa-upload" /> Upload data
                </a>
              )}
            </div>
          ) : (
            <>

              {/* ── Summary KPI strip ── */}
              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                {[
                  {
                    label: 'Cohort avg attendance',
                    value: cohortAvg !== null ? `${cohortAvg}%` : '—',
                    icon: 'fa-users',
                    color: pctColor(cohortAvg),
                  },
                  {
                    label: 'People tracked',
                    value: kpi?.cohort_size ?? '—',
                    icon: 'fa-person',
                    color: '#06b6d4',
                  },
                  {
                    label: 'Avg session length',
                    value: kpi
                      ? `${(kpi.data.reduce((s, r) => s + (r.avg_session_hours ?? 0), 0) / (kpi.data.length || 1)).toFixed(1)}h`
                      : '—',
                    icon: 'fa-clock',
                    color: '#06b6d4',
                  },
                  {
                    label: 'Working days (window)',
                    value: kpi?.data[0]?.total_working_days ?? '—',
                    icon: 'fa-calendar',
                    color: '#06b6d4',
                  },
                ].map((s) => (
                  <div className="card stat-card" key={s.label}>
                    <div className="stat-top">
                      <div className="icon-badge icon-badge-cyan">
                        <i className={`fa-solid ${s.icon} icon-cyan`}></i>
                      </div>
                    </div>
                    <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Charts row ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

                {/* Attendance % bar chart */}
                <div className="card card-static">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-chart-bar icon-cyan"></i>
                    <h2>Attendance Rate by Person</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={kpi?.data.map((r) => ({
                        name: r.full_name?.split(' ')[0] ?? r.person_id,
                        pct: r.attendance_pct ?? 0,
                        own: r.is_own,
                      }))}
                      margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip formatter={(value) => [`${value}%`, 'Attendance']}
                        contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', fontSize: '0.8rem', }}
                      />
                      <Bar dataKey="pct" radius={[6, 6, 0, 0]} fill="#06b6d4" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Weekly trend line */}
                <div className="card card-static">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-chart-line icon-cyan"></i>
                    <h2>
                      {trend?.mode === 'cohort' ? 'Team Attendance Trend' : 'My Weekly Trend'}
                    </h2>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={trend?.data.map((d) => ({
                        week: shortWeek(d.week_start),
                        days: trend.mode === 'cohort' ? d.avg_days_present : d.days_present,
                        hours: d.avg_session_hours,
                      }))}
                      margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                      <Line type="monotone" dataKey="days" name="Days present" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="hours" name="Avg hours" stroke="#0891b2" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

              </div>

              {/* ── Per-person table (admin/leadership/manager) ── */}
              {['admin', 'leadership', 'manager'].includes(role) && kpi && (
                <div className="card card-static" style={{ padding: 0, marginBottom: '1.5rem' }}>
                  <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <i className="fa-solid fa-table icon-cyan"></i>
                    <h2 style={{ margin: 0 }}>Individual Breakdown</h2>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>30-day window</span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(6,182,212,0.04)' }}>
                          {['Name', 'Role', 'Days present', 'Attendance', 'Avg arrival', 'Avg session', 'Total hours'].map((h) => (
                            <th key={h} style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {kpi.data.map((r, i) => (
                          <tr
                            key={r.person_id}
                            style={{
                              borderBottom: i < kpi.data.length - 1 ? '1px solid var(--border)' : 'none',
                              background: r.is_own ? 'rgba(6,182,212,0.04)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.85rem 1.25rem', fontWeight: r.is_own ? 700 : 400, color: 'var(--text)' }}>
                              {r.full_name ?? '—'}
                              {r.is_own && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#06b6d4', fontWeight: 600 }}>you</span>
                              )}
                            </td>
                            <td style={{ padding: '0.85rem 1.25rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.user_role}</td>
                            <td style={{ padding: '0.85rem 1.25rem', color: 'var(--text)' }}>{r.days_present} / {r.total_working_days}</td>
                            <td style={{ padding: '0.85rem 1.25rem' }}>
                              <span style={{
                                display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '999px',
                                fontSize: '0.75rem', fontWeight: 700,
                                background: `${pctColor(r.attendance_pct)}18`,
                                color: pctColor(r.attendance_pct),
                                border: `1px solid ${pctColor(r.attendance_pct)}40`,
                              }}>
                                {r.attendance_pct !== null ? `${r.attendance_pct}%` : '—'}
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 1.25rem', color: 'var(--text)' }}>{r.avg_arrival ?? '—'}</td>
                            <td style={{ padding: '0.85rem 1.25rem', color: 'var(--text)' }}>
                              {r.avg_session_hours !== null ? `${r.avg_session_hours.toFixed(1)}h` : '—'}
                            </td>
                            <td style={{ padding: '0.85rem 1.25rem', color: 'var(--text)' }}>
                              {r.total_session_hours !== null ? `${r.total_session_hours.toFixed(1)}h` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Caveats ── */}
              <div className="card card-static" style={{ padding: '1rem 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <i className="fa-solid fa-circle-info icon-cyan" style={{ marginTop: '0.1rem', flexShrink: 0 }}></i>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.875rem', marginBottom: '0.4rem' }}>Data notes</p>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {[
                        'Attendance is computed from imported badge/access-event records (via CSV upload). Remote or hybrid days are not captured unless included in the upload.',
                        'Session hours = last exit − first entry. Missing exit events result in null session hours for that day.',
                        'Team-level figures are hidden when the cohort has fewer than 5 members.',
                        '30-day window is rolling and excludes weekends. Working days count may vary by locale.',
                      ].map((note) => (
                        <li key={note} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}