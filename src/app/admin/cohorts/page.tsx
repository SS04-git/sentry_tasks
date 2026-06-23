'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

export default function CohortsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
  const loadData = async () => {
    try {
      const token = getToken();

      if (!token) return;

      const result = await fetchWithAuth(
        'api/v1/cohorts',
        token
      );

      setData(result);
    } catch (err) {
      console.error('Failed to load cohorts', err);
    }
  };

  loadData();
}, []);

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav active="admin" />

        <div className="page-body">

            {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            <a href="/admin" style={{ textDecoration: 'none', color: 'var(--text-muted)' }}>Admin</a>
            <i className="fa-solid fa-chevron-right" />
            <span style={{ fontWeight: 600 }}>Cohorts</span>
          </div>

          {/* Header */}
          <div className="page-header">
            <h1>Behavioural Cohorts</h1>
            <p>User segmentation using session behavior clustering</p>
          </div>

          <div className="card card-static">
  <h2>Cohort Summary</h2>

  <p style={{ marginBottom: '1rem' }}>
    Clusters: <strong>{data?.k ?? 0}</strong>
  </p>

  <div className="table-container">
    <table>
      <thead>
        <tr>
          <th>Cluster</th>
          <th className="table-number">Arrival</th>
          <th className="table-number">Session Length</th>
        </tr>
      </thead>

      <tbody>
        {data?.centroids?.length > 0 ? (
          data.centroids.map((c: any, i: number) => (
            <tr key={i}>
              <td>{i}</td>
              <td className="table-number">
                {c[0]?.toFixed(2) ?? 0}
              </td>
              <td className="table-number">
                {c[1]?.toFixed(2) ?? 0}
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
              No cohort data available
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>


<div
  className="card card-static"
  style={{ marginTop: '1.5rem' }}
>
  <h2>Cross-Source Insights</h2>

  <table>
    <thead>
      <tr>
        <th>Hypothesis</th>
        <th>Confidence</th>
        <th>Confidence Interval</th>
        <th>Sample Size</th>
      </tr>
    </thead>

    <tbody>
      {data?.insights?.map(
        (insight: any, index: number) => (
          <tr key={index}>
  <td>{insight.hypothesis}</td>

  <td>
    {(insight.confidence * 100).toFixed(0)}%
  </td>

  <td>
    {insight.interval}
  </td>

  <td>
    {insight.sample_size}
  </td>
</tr>
        )
      )}
    </tbody>
  </table>
</div>


        </div>
      </div>
    </ProtectedRoute>
  );
}