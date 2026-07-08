'use client';

import { useEffect, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Label, Cell,
} from 'recharts';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

const CLUSTER_COLORS = ['#06b6d4', '#0891b2', '#0e7490', '#155e75'];

export default function CohortsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = getToken();
        if (!token) return;
        const result = await fetchWithAuth('api/v1/cohorts/', token); // trailing slash here
        setData(result);
      } catch (err) {
        console.error('Failed to load cohorts', err);
      }
    };
    loadData();
  }, []);

  const scatterPoints = data?.centroids?.map((c: number[], i: number) => ({
    x: parseFloat(c[0]?.toFixed(2)),
    y: parseFloat(c[1]?.toFixed(2)),
    cluster: i,
  })) ?? [];

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

          {/* Cohort Summary — scatter chart */}
          <div className="card card-static">
            <div className="section-header" style={{ marginBottom: '1.5rem' }}>
              <i className="fa-solid fa-object-group icon-cyan" />
              <h2>Cohort Summary</h2>
              <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {data?.k ?? 0} clusters
              </span>
            </div>

            {scatterPoints.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    >
                      <Label
                        value="Arrival Time (hrs)"
                        offset={-10}
                        position="insideBottom"
                        style={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      />
                    </XAxis>
                    <YAxis
                      type="number"
                      dataKey="y"
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: 'Session Length (min)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 12, fill: 'var(--text-muted)' },
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(value: any, name: any) => [
                        value,
                        name === 'x' ? 'Arrival Time' : 'Session Length',
                      ] as [any, any]}
                      labelFormatter={(_: any, payload: any) =>
                        payload?.[0] ? `Cluster ${payload[0].payload.cluster}` : ''
                      }
                    />
                    <Scatter data={scatterPoints} r={10}>
                      {scatterPoints.map((_: any, i: number) => (
                        <Cell key={i} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', justifyContent: 'center' }}>
                  {scatterPoints.map((_: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }} />
                      Cluster {i}
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: '12px', textAlign: 'center', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
                  Cluster Centroids — Arrival Time vs Session Length
                </p>
              </>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
                No cohort data available
              </p>
            )}
          </div>

          {/* Cross-Source Insights */}
          <div className="card card-static" style={{ marginTop: '1.5rem' }}>
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
                {data?.insights?.map((insight: any, index: number) => (
                  <tr key={index}>
                    <td>{insight.hypothesis}</td>
                    <td>{(insight.confidence * 100).toFixed(0)}%</td>
                    <td>{insight.interval}</td>
                    <td>{insight.sample_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
