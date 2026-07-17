'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { getToken } from '@/app/lib/auth';
import { getTrend, getForecast, getKPI } from '@/app/lib/occupancy';
import { KpiCaveat, OccupancyKPICard } from '@/app/components/KpiCaveat';
import OccupancyTrendChart from '@/app/components/OccupancyTrendChart';
import ForecastChart from '@/app/components/ForecastChart';
import type { OccupancyTrend, ForecastPoint, OccupancyKPI } from '@/app/lib/occupancy';

export default function OccupancyPage() {
  const [trend,    setTrend]    = useState<OccupancyTrend[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [kpi,      setKpi]      = useState<OccupancyKPI | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const [t, f, k] = await Promise.all([
          getTrend(token),
          getForecast(token),
          getKPI(token),
        ]);
        setTrend(t);
        setForecast(f);
        setKpi(k);
      } catch (err) {
        setError('Failed to load occupancy data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const latestSlope = trend.length > 0 ? trend[trend.length - 1]?.weekly_slope ?? 0 : 0;

  return (
    <ProtectedRoute>
      <div className="page">

        <PageNav active="reports" />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            <a href="/reports" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Reports</a>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: '12px' }} />
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Occupancy</span>
          </div>

          {/* Header */}
          <div className="page-header">
            <h1>Occupancy Analytics</h1>
            <p>Building utilization, occupancy trends, and forecasted demand</p>
          </div>

          {loading ? (
            <div className="card card-static" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
              <i className="fa-solid fa-spinner fa-spin icon-cyan"></i>
              <p style={{ margin: 0 }}>Loading occupancy data…</p>
            </div>
          ) : error ? (
            <div className="card card-static" style={{ padding: '2rem', textAlign: 'center' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f43f5e', fontSize: '1.5rem', marginBottom: '0.75rem', display: 'block' }}></i>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* KPI Strip */}
              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <OccupancyKPICard title="Peak Occupancy"    value={kpi?.peak ?? 0}              icon="fa-users" />
                <OccupancyKPICard title="Average Occupancy" value={kpi?.avg.toFixed(1) ?? '—'}  icon="fa-chart-line" />
                <OccupancyKPICard title="Minimum Occupancy" value={kpi?.min ?? 0}               icon="fa-building" />
                <OccupancyKPICard
                  title="Trend Direction"
                  value={latestSlope > 0 ? 'Increasing' : latestSlope < 0 ? 'Decreasing' : 'Stable'}
                  icon="fa-arrow-trend-up"
                />
              </div>

              {/* Charts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="card card-static" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: '450px' }}>
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                  <i className="fa-solid fa-chart-line icon-cyan"></i>
                  <h2>Occupancy Trend</h2>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <OccupancyTrendChart data={trend} />
                </div>
              </div>

                <div className="card card-static" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: '450px' }}>
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                  <i className="fa-solid fa-wand-magic-sparkles icon-cyan"></i>
                  <h2>Occupancy Forecast</h2>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <ForecastChart data={forecast} />
                  </div>
                </div>
                </div>
        

              {/* Notes + caveat */}
              <div className="card card-static" style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <i className="fa-solid fa-circle-info icon-cyan"></i>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Occupancy Notes</p>
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                      <li>Peak occupancy represents the maximum simultaneous occupants observed per day.</li>
                      <li>Trend values are derived from a rolling analysis of historical data.</li>
                      <li>Forecasts are generated using historical patterns.</li>
                      <li>Confidence bands indicate expected range.</li>
                    </ul>
                    <KpiCaveat kpiKey="occupancy" />
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
