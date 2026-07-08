'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { patchWithAuth } from '@/app/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

type Section = 'profile' | 'password' | 'sessions';

type Toast = { message: string; type: 'success' | 'error' } | null;

// ── Sub-components ─────────────────────────────────────────────────────────

function Toast({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.85rem 1.25rem',
      background: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
      border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
      borderRadius: '10px',
      fontSize: '0.85rem',
      fontWeight: 500,
      color: toast.type === 'success' ? '#10b981' : '#f43f5e',
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      backdropFilter: 'blur(8px)',
      maxWidth: '340px',
    }}>
      <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0 }}>
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="profile-field">
  <label className="profile-label">{label}</label>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

function ProfilePageContent() {
  const { user } = useAuth();
  const role = user?.role ?? 'employee';
  const searchParams = useSearchParams();

  const [section, setSection] = useState<Section>(
    (searchParams.get('section') as Section) ?? 'profile'
  );
  const [toast, setToast]     = useState<Toast>(null);

  // Profile fields
  const [fullName, setFullName]   = useState(user?.full_name ?? '');
  const [email]                   = useState(user?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [savingPw,   setSavingPw]   = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleProfileSave = async () => {
    const token = getToken();
    if (!token) return;
    setSavingProfile(true);
    try {
      await patchWithAuth('api/v1/users/me', token, { full_name: fullName });
      showToast('Profile updated successfully.', 'success');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      showToast('Please fill in all password fields.', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    const token = getToken();
    if (!token) return;
    setSavingPw(true);
    try {
      await patchWithAuth('api/v1/users/me/password', token, {
        current_password: currentPw,
        new_password:     newPw,
      });
      showToast('Password changed successfully.', 'success');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to change password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const navItems: { key: Section; icon: string; label: string }[] = [
    { key: 'profile',  icon: 'fa-user',        label: 'Profile'          },
    { key: 'password', icon: 'fa-lock',         label: 'Change Password'  },
    { key: 'sessions', icon: 'fa-shield-halved', label: 'Security'        },
  ];

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav />

        <Toast toast={toast} onClose={() => setToast(null)} />

        <div className="page-body">

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            <a href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: '12px' }} />
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Profile Settings</span>
          </div>

          <div className="page-header" style={{ marginBottom: '2rem' }}>
            <h1>Profile Settings</h1>
            <p>Manage your account details and security preferences.</p>
          </div>

          <div className="profile-layout">

            {/* ── Sidebar nav ── */}
            <div className="card profile-sidebar">

              {/* Avatar */}
              <div className="profile-sidebar-header">
                <div className="profile-avatar">
                  <i className="fa-solid fa-user" style={{ color: 'white', fontSize: '1.2rem' }} />
                </div>
                <p className="profile-name">{user?.full_name ?? user?.email?.split('@')[0]}</p>
                <p className="profile-role">{role}</p>
              </div>

              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`profile-nav-item ${
                  section === item.key ? 'active' : ''}`}>
                  <i className={`fa-solid ${item.icon}`} style={{ width: '14px', textAlign: 'center' }} />
                  {item.label}
                </button>
              ))}
            </div>

            {/* ── Main panel ── */}
            <div>

              {/* ── Profile section ── */}
              {section === 'profile' && (
                <div className="card">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-user icon-cyan" />
                    <h2>Profile Information</h2>
                  </div>

                  <div className="profile-form">

                    <Field label="Full name">
                      <input
                        className="profile-input"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Your full name"
                      />
                    </Field>

                    <Field label="Email address">
                      <div style={{ position: 'relative' }}>
                        <input
                          className="profile-input profile-input-readonly"
                          value={email}
                          readOnly
                        />
                        <i className="fa-solid fa-lock" style={{
                          position: 'absolute', right: '0.75rem', top: '50%',
                          transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '12px',
                        }} />
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                        Email cannot be changed. Contact an admin if you need to update it.
                      </p>
                    </Field>

                    <Field label="Role">
                      <div className="profile-input profile-input-readonly" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', }}>
                        <i className="fa-solid fa-id-badge" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
                        <span style={{ textTransform: 'capitalize' }}>{role}</span>
                      </div>
                    </Field>

                    <div style={{ paddingTop: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleProfileSave}
                        disabled={savingProfile}
                        style={{ minWidth: '140px' }}
                      >
                        {savingProfile
                          ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />Saving…</>
                          : 'Save changes'
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Password section ── */}
              {section === 'password' && (
                <div className="card">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-lock icon-cyan" />
                    <h2>Change Password</h2>
                  </div>

                  <div className="profile-form">

                    <Field label="Current password">
                      <div style={{ position: 'relative' }}>
                        <input
                        type={showPw ? 'text' : 'password'}
                        className="profile-input profile-input-with-icon"
                        value={currentPw}
                        onChange={e => setCurrentPw(e.target.value)}
                        placeholder="Enter current password"
                        autoComplete="current-password"/>
                        <button
                          type="button"
                          onClick={() => setShowPw(p => !p)}
                          style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                        >
                          <i className={`fa-solid ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} style={{ fontSize: '0.8rem' }} />
                        </button>
                      </div>
                    </Field>

                    <Field label="New password">
                      <input
                        type={showPw ? 'text' : 'password'}
                        className="profile-input"
                        value={newPw}
                        onChange={e => { setNewPw(e.target.value);}}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                      />
                    </Field>

                    <Field label="Confirm new password">
                      <div style={{ position: 'relative' }}>
                        <input type={showPw ? 'text' : 'password'}
                        className={`profile-input profile-input-with-icon ${
                          confirmPw && newPw !== confirmPw ? 'profile-input-error' : ''
                        }`}
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        placeholder="Re-enter new password"
                        autoComplete="new-password"/>
                        {confirmPw && (
                          <i
                            className={`fa-solid ${newPw === confirmPw ? 'fa-check' : 'fa-xmark'}`}
                            style={{
                              position: 'absolute', right: '0.75rem', top: '50%',
                              transform: 'translateY(-50%)',
                              color: newPw === confirmPw ? '#10b981' : '#f43f5e',
                              fontSize: '0.8rem',
                            }}
                          />
                        )}
                      </div>
                    </Field>

                    <div style={{ paddingTop: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handlePasswordSave}
                        disabled={savingPw || !currentPw || !newPw || !confirmPw}
                        style={{ minWidth: '160px' }}
                      >
                        {savingPw
                          ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />Changing…</>
                          : 'Change password'
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Security section ── */}
              {section === 'sessions' && (
                <div className="card">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-shield-halved icon-cyan" />
                    <h2>Security</h2>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Current session */}
                    <div className="session-card">
                      <div className="session-icon">
                        <i className="fa-solid fa-display" style={{ color: '#10b981', fontSize: '0.9rem' }} />
                      </div>
                      <div className="session-info">
                        <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>Current session</p>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                          Active now · {typeof window !== 'undefined' ? window.navigator.platform : 'Web'}
                        </p>
                      </div>
                      <span className="session-status">
                        Active
                      </span>
                    </div>

                    {/* Info rows */}
                    {[
                      { label: 'Account created',   value: 'Managed by admin',       icon: 'fa-calendar' },
                      { label: 'Last password set', value: 'Unknown',                icon: 'fa-key' },
                      { label: 'Role',              value: role,                     icon: 'fa-id-badge' },
                      { label: 'Email verified',    value: 'Via admin provisioning', icon: 'fa-envelope-circle-check' },
                    ].map(row => (
                      <div key={row.label} className="security-row">
                        <i className={`fa-solid ${row.icon}`} style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: '16px', textAlign: 'center' }} />
                        <span className="security-label">{row.label}</span>
                        <span className="security-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <ProtectedRoute>
          <div className="page">
            <PageNav />
            <div className="page-body">
              <p>Loading...</p>
            </div>
          </div>
        </ProtectedRoute>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
