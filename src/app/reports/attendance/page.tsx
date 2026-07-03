'use client';

import { useState, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { fetchWithAuth } from '@/app/lib/api';

interface UploadResult {
  filename: string;
  rows_inserted: number;
  rows_skipped: number;
  errors: string[];
}

const SAMPLE_CSV = `person_id,email,event_ts,direction,access_method,access_result
,employee@sentry.com,2026-06-01T08:12:00,entry,card,granted
,employee@sentry.com,2026-06-01T17:03:00,exit,card,granted
`;

export default function AdminAttendanceUploadPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'employee';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile]       = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]   = useState<UploadResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const allowed = ['admin', 'leadership'].includes(role);

  const handleFileSelect = (f: File | null) => {
    setResult(null);
    setError(null);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    const token = getToken();
    if (!token) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res: UploadResult = await fetchWithAuth('api/v1/attendance/upload', token, {
        method: 'POST',
        body: formData,
      });

      setResult(res);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-upload-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!allowed) {
    return (
      <ProtectedRoute>
        <div className="page">
          <PageNav />
          <div className="page-body">
            <div className="card card-static" style={{ padding: '2rem', textAlign: 'center' }}>
              <i className="fa-solid fa-lock" style={{ fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'block' }} />
              <p style={{ margin: 0 }}>You don't have access to this page.</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav />
        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            <a href="/reports" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Reports</a>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.65rem' }} />
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Upload Attendance Data</span>
          </div>

          <div className="page-header" style={{ marginBottom: '2rem' }}>
            <h1>Upload Attendance Data</h1>
            <p>Import badge/access-event records from a CSV file. Duplicate rows are skipped automatically.</p>
          </div>

          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <i className="fa-solid fa-file-csv icon-cyan" />
              <h2>CSV format</h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Required columns: <code>person_id</code>, <code>event_ts</code>, <code>direction</code>.
              Optional: <code>email</code> (used instead of <code>person_id</code> if left blank),
              <code> access_method</code>, <code>access_result</code>.
              <br />
              <code>event_ts</code> must be ISO format, e.g. <code>2026-06-01T08:15:00</code>.
              <code> direction</code> must be <code>entry</code> or <code>exit</code>.
            </p>
            <button type="button" className="btn" onClick={downloadSample} style={{ fontSize: '0.8rem' }}>
              <i className="fa-solid fa-download" style={{ marginRight: '0.4rem' }} />
              Download sample template
            </button>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div className="section-header" style={{ marginBottom: '1.25rem' }}>
              <i className="fa-solid fa-upload icon-cyan" />
              <h2>Upload file</h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                style={{ fontSize: '0.85rem' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!file || uploading}
                style={{ minWidth: '120px' }}
              >
                {uploading
                  ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />Uploading…</>
                  : 'Upload'
                }
              </button>
            </div>

            {error && (
              <div style={{
                marginTop: '1.25rem', padding: '0.85rem 1rem', borderRadius: '10px',
                background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)',
                color: '#f43f5e', fontSize: '0.85rem',
              }}>
                <i className="fa-solid fa-circle-xmark" style={{ marginRight: '0.5rem' }} />
                {error}
              </div>
            )}

            {result && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    flex: 1, padding: '0.85rem 1rem', borderRadius: '10px',
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
                  }}>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Rows inserted</p>
                    <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#10b981' }}>{result.rows_inserted}</p>
                  </div>
                  <div style={{
                    flex: 1, padding: '0.85rem 1rem', borderRadius: '10px',
                    background: result.rows_skipped > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(6,182,212,0.08)',
                    border: `1px solid ${result.rows_skipped > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(6,182,212,0.3)'}`,
                  }}>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Rows skipped</p>
                    <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: result.rows_skipped > 0 ? '#f59e0b' : '#06b6d4' }}>
                      {result.rows_skipped}
                    </p>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div style={{
                    padding: '0.85rem 1rem', borderRadius: '10px',
                    background: 'rgba(245,158,11,0.05)', border: '1px solid var(--border)',
                    maxHeight: '220px', overflowY: 'auto',
                  }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                      Row errors {result.rows_skipped > result.errors.length ? '(showing first 50)' : ''}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {result.errors.map((e, i) => (
                        <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}