'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

type ROIRecord = {
  quarter: string;
  realised: number;
  model: number;
  rework: number;
  delivery: number;
  facilities: number;
  incident: number;
};

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

export default function ROIPage() {
  const [data, setData] = useState<ROIRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadROI = async () => {
      try {
        const token = getToken();
        if (!token) return;

        const result = await fetchWithAuth(
          'api/v1/roi',
          token
        );

        setData(result);
      } catch (err) {
        console.error('Failed to load ROI data', err);
      } finally {
        setLoading(false);
      }
    };

    loadROI();
  }, []);

  const totalRealised = data.reduce(
    (sum, row) => sum + row.realised,
    0
  );

  const totalModel = data.reduce(
    (sum, row) => sum + row.model,
    0
  );

  return (
    <ProtectedRoute>
      <div className="page">
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

            <i className="fa-solid fa-chevron-right" />

            <span style={{ fontWeight: 600 }}>
              ROI Tracking
            </span>
          </div>

          {/* Header */}
          <div className="page-header">
            <h1>ROI Tracking</h1>
            <p>
              Realised value versus illustrative model value,
              reviewed quarterly.
            </p>
          </div>

          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div className="card card-static">
              <h3>Total Realised Value</h3>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 800,
                  marginTop: '0.5rem',
                }}
              >
                {formatINR(totalRealised)}
              </div>
            </div>

            <div className="card card-static">
              <h3>Total Model Value</h3>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 800,
                  marginTop: '0.5rem',
                }}
              >
                {formatINR(totalModel)}
              </div>
            </div>

            <div className="card card-static">
              <h3>Quarters Tracked</h3>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 800,
                  marginTop: '0.5rem',
                }}
              >
                {data.length}
              </div>
            </div>
          </div>

          {/* Quarterly ROI Comparison */}
<div className="card card-static" style={{ marginBottom: '1.5rem' }}>
  <h2>Quarterly ROI Comparison</h2>

  {loading ? (
    <p>Loading...</p>
  ) : (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Quarter</th>
            <th className="table-number">Realised</th>
            <th className="table-number">Model</th>
          </tr>
        </thead>

        <tbody>
  {data.length > 0 ? (
    data.map((row: any, index: number) => (
      <tr key={`${row.quarter}-${index}`}>
                <td>{row.quarter}</td>
                <td className="table-number">
                  {formatINR(row.realised)}
                </td>
                <td className="table-number">
                  {formatINR(row.model)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={3}
                style={{
                  textAlign: 'center',
                  color: '#888',
                  padding: '1rem',
                }}
              >
                No ROI data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )}
</div>

          {/* ROI Value Drivers */}
<div className="card card-static">
  <h2>ROI Value Drivers</h2>

  {loading ? (
    <p>Loading...</p>
  ) : (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Quarter</th>
            <th className="table-number">Rework</th>
            <th className="table-number">Delivery</th>
            <th className="table-number">Facilities</th>
            <th className="table-number">Incident Avoidance</th>
          </tr>
        </thead>

        <tbody>
  {data.length > 0 ? (
    data.map((row: any, index: number) => (
      <tr key={`${row.quarter}-${index}`}>
        <td>{row.quarter}</td>
        <td className="table-number">
          {formatINR(row.rework)}
        </td>
        <td className="table-number">
          {formatINR(row.delivery)}
        </td>
        <td className="table-number">
          {formatINR(row.facilities)}
        </td>
        <td className="table-number">
          {formatINR(row.incident)}
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td
        colSpan={5}
        style={{
          textAlign: 'center',
          color: '#888',
          padding: '1rem',
        }}
      >
        No ROI data available
      </td>
    </tr>
  )}
</tbody>
      </table>
    </div>
  )}
</div>

        </div>
      </div>
    </ProtectedRoute>
  );
}