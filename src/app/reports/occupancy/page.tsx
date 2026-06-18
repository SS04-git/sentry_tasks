import {
  getTrend,
  getForecast,
  getKPI,
} from "@/app/lib/occupancy";

import OccupancyTrendChart from "@/app/components/OccupancyTrendChart";
import ForecastChart from "@/app/components/ForecastChart";
import OccupancyKPICard from "@/app/components/OccupancyKPICard";

export default async function OccupancyPage() {
  const trend = await getTrend();
  const forecast = await getForecast();
  const kpi = await getKPI();

  const latestSlope =
    trend.length > 0
      ? trend[trend.length - 1]?.weekly_slope ?? 0
      : 0;

  return (
    <div className="page">

      {/* ── Nav ── */}
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

            <a href="/reports" className="nav-link active">
              <i className="fa-solid fa-chart-bar icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Reports
            </a>

            <a href="/admin" className="nav-link">
              <i className="fa-solid fa-screwdriver-wrench icon-sm" style={{ marginRight: '0.4rem' }}></i>
              Admin
            </a>
          </div>

          <div className="nav-user">
            <div className="nav-notification">
              <i className="fa-solid fa-bell icon-cyan"></i>
            </div>

            <div className="profile-trigger">
              <i className="fa-solid fa-circle-user icon-cyan"></i>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page Body ── */}
      <div className="page-body">

        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.82rem",
            color: "var(--text-muted)",
            marginBottom: "1.5rem",
          }}
        >
          <a href="/reports" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            Reports
          </a>

          <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.65rem" }} />

          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            Occupancy
          </span>
        </div>

        {/* Header */}
        <div className="page-header">
          <h1>Occupancy Analytics</h1>
          <p>
            Building utilization, occupancy trends, and forecasted demand
          </p>
        </div>

        {/* KPI Strip */}
        <div className="stats-grid" style={{ marginBottom: "2rem" }}>
          <OccupancyKPICard title="Peak Occupancy" value={kpi.peak} icon="fa-users" />
          <OccupancyKPICard title="Average Occupancy" value={kpi.avg.toFixed(1)} icon="fa-chart-line" />
          <OccupancyKPICard title="Minimum Occupancy" value={kpi.min} icon="fa-building" />
          <OccupancyKPICard
            title="Trend Direction"
            value={
              latestSlope > 0
                ? "Increasing"
                : latestSlope < 0
                ? "Decreasing"
                : "Stable"
            }
            icon="fa-arrow-trend-up"
          />
        </div>

        {/* Charts */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <div className="card card-static" style={{ padding: "1.5rem" }}>
            <div className="section-header" style={{ marginBottom: "1.5rem" }}>
              <i className="fa-solid fa-chart-line icon-cyan"></i>
              <h2>Occupancy Trend</h2>
            </div>

            <OccupancyTrendChart data={trend} />
          </div>

          <div className="card card-static" style={{ padding: "1.5rem" }}>
            <div className="section-header" style={{ marginBottom: "1.5rem" }}>
              <i className="fa-solid fa-wand-magic-sparkles icon-cyan"></i>
              <h2>Occupancy Forecast</h2>
            </div>

            <ForecastChart data={forecast} />
          </div>
        </div>

        {/* Notes */}
        <div className="card card-static" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <i className="fa-solid fa-circle-info icon-cyan"></i>

            <div>
              <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                Occupancy Notes
              </p>

              <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                <li>Peak occupancy represents the maximum simultaneous occupants observed per day.</li>
                <li>Trend values are derived from a rolling analysis of historical data.</li>
                <li>Forecasts are generated using historical patterns.</li>
                <li>Confidence bands indicate expected range.</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}