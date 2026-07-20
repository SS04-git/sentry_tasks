'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PageNav from '@/app/components/PageNav';
import { useAuth } from '@/app/context/AuthContext';
import { getToken } from '@/app/lib/auth';
import { patchWithAuth, postWithAuth, getWithAuth, deleteWithAuth } from '@/app/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

type Section = 'profile' | 'password' | 'sessions' | 'users' | 'roles';

type Toast = { message: string; type: 'success' | 'error' } | null;

interface ManagedUser {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  permissions: string[];
}

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
  const [toast, setToast] = useState<Toast>(null);

  // Profile fields
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email] = useState(user?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Creating user
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('employee');
  const [creatingUser, setCreatingUser] = useState(false);

  // Roles & permissions (admin only)
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);

  const [permCatalog, setPermCatalog] = useState<Record<string, string>>({});
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingPerms, setEditingPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

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
        new_password: newPw,
      });
      showToast('Password changed successfully.', 'success');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to change password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPassword) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    const token = getToken();
    if (!token) return;
    setCreatingUser(true);
    try {
      await postWithAuth('api/v1/users/', token, {
        full_name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
      });
      showToast('User created successfully.', 'success');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('employee');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to create user.', 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  useEffect(() => {
  if (section !== 'roles' || role !== 'admin') return;
  const token = getToken();
  if (!token) return;
  setLoadingUsers(true);
  Promise.all([
    getWithAuth('api/v1/users/', token),
    getWithAuth('api/v1/users/permissions/catalog', token),
  ])
    .then(([usersData, catalogData]) => {
      setAllUsers(Array.isArray(usersData) ? usersData : []);
      setPermCatalog(catalogData?.permissions ?? {});
    })
    .catch((err) => showToast(err?.message ?? 'Failed to load users.', 'error'))
    .finally(() => setLoadingUsers(false));
}, [section, role]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    const token = getToken();
    if (!token) return;
    setSavingUserId(userId);
    try {
      const updated = await patchWithAuth(`api/v1/users/${userId}/role`, token, { role: newRole });
      setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: updated.role } : u)));
      showToast('Role updated successfully.', 'success');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to update role.', 'error');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleActive = async (u: ManagedUser) => {
    const token = getToken();
    if (!token) return;
    setSavingUserId(u.id);
    try {
      const endpoint = u.is_active ? 'disable' : 'enable';
      const updated = await patchWithAuth(`api/v1/users/${u.id}/${endpoint}`, token, {});
      setAllUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_active: updated.is_active } : x)));
      showToast(`User ${u.is_active ? 'disabled' : 'enabled'}.`, 'success');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to update user status.', 'error');
    } finally {
      setSavingUserId(null);
    }
  };

  const openPermissionsEditor = (u: ManagedUser) => {
  setEditingUserId(u.id);
  setEditingPerms(u.permissions ?? []);
};

const togglePermission = (key: string) => {
  setEditingPerms(prev =>
    prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
  );
};

const savePermissions = async () => {
  if (editingUserId == null) return;
  const token = getToken();
  if (!token) return;
  setSavingPerms(true);
  try {
    const updated = await patchWithAuth(`api/v1/users/${editingUserId}/permissions`, token, {
      permissions: editingPerms,
    });
    setAllUsers(prev => prev.map(u => (u.id === editingUserId ? { ...u, permissions: updated.permissions } : u)));
    showToast('Permissions updated successfully.', 'success');
    setEditingUserId(null);
  } catch (err: any) {
    showToast(err?.message ?? 'Failed to update permissions.', 'error');
  } finally {
    setSavingPerms(false);
  }
};

const resetPermissions = async () => {
  if (editingUserId == null) return;
  const token = getToken();
  if (!token) return;
  setSavingPerms(true);
  try {
    const updated = await deleteWithAuth(`api/v1/users/${editingUserId}/permissions`, token);
    setAllUsers(prev => prev.map(u => (u.id === editingUserId ? { ...u, permissions: updated.permissions } : u)));
    showToast('Permissions reset to role default.', 'success');
    setEditingUserId(null);
  } catch (err: any) {
    showToast(err?.message ?? 'Failed to reset permissions.', 'error');
  } finally {
    setSavingPerms(false);
  }
};

  const navItems: { key: Section; icon: string; label: string }[] = [
    { key: 'profile', icon: 'fa-user', label: 'Profile' },
    { key: 'password', icon: 'fa-lock', label: 'Change Password' },
    { key: 'sessions', icon: 'fa-shield-halved', label: 'Security' },
    ...(role === 'admin' ? [{ key: 'users' as Section, icon: 'fa-user-plus', label: 'Create User' }] : []),
    ...(role === 'admin' ? [{ key: 'roles' as Section, icon: 'fa-user-gear', label: 'Roles & Permissions' }] : []),
  ];

  return (
    <ProtectedRoute>
      <div className="page">
        <PageNav />

        <Toast toast={toast} onClose={() => setToast(null)} />

        {editingUserId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, }}>
          <div className="card" style={{ width: '420px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <i className="fa-solid fa-user-shield icon-cyan" />
              <h2>Edit Access — {allUsers.find(u => u.id === editingUserId)?.email}</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {Object.entries(permCatalog).map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={editingPerms.includes(key)} onChange={() => togglePermission(key)}/>
                  {label}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={resetPermissions} disabled={savingPerms}>
                Reset to role default
              </button>
              <button className="btn btn-secondary" onClick={() => setEditingUserId(null)} disabled={savingPerms}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={savePermissions} disabled={savingPerms}>
                {savingPerms ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className={`profile-nav-item ${section === item.key ? 'active' : ''}`}
                >
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
                      <div className="profile-input profile-input-readonly" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                          autoComplete="current-password"
                        />
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
                        onChange={e => { setNewPw(e.target.value); }}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                      />
                    </Field>

                    <Field label="Confirm new password">
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPw ? 'text' : 'password'}
                          className={`profile-input profile-input-with-icon ${
                            confirmPw && newPw !== confirmPw ? 'profile-input-error' : ''
                          }`}
                          value={confirmPw}
                          onChange={e => setConfirmPw(e.target.value)}
                          placeholder="Re-enter new password"
                          autoComplete="new-password"
                        />
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
                      { label: 'Account created', value: 'Managed by admin', icon: 'fa-calendar' },
                      { label: 'Last password set', value: 'Unknown', icon: 'fa-key' },
                      { label: 'Role', value: role, icon: 'fa-id-badge' },
                      { label: 'Email verified', value: 'Via admin provisioning', icon: 'fa-envelope-circle-check' },
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

              {/* ── Create User section (admin only) ── */}
              {section === 'users' && role === 'admin' && (
                <div className="card">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-user-plus icon-cyan" />
                    <h2>Create User</h2>
                  </div>

                  <div className="profile-form">

                    <Field label="Full name">
                      <input
                        className="profile-input"
                        value={newUserName}
                        onChange={e => setNewUserName(e.target.value)}
                        placeholder="Full name"
                      />
                    </Field>

                    <Field label="Email address">
                      <input
                        className="profile-input"
                        type="email"
                        value={newUserEmail}
                        onChange={e => setNewUserEmail(e.target.value)}
                        placeholder="name@company.com"
                      />
                    </Field>

                    <Field label="Temporary password">
                      <input
                        className="profile-input"
                        type="text"
                        value={newUserPassword}
                        onChange={e => setNewUserPassword(e.target.value)}
                        placeholder="Set a temporary password"
                      />
                    </Field>

                    <Field label="Role">
                      <select
                        className="profile-input"
                        value={newUserRole}
                        onChange={e => setNewUserRole(e.target.value)}
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="leadership">Leadership</option>
                        <option value="admin">Admin</option>
                      </select>
                    </Field>

                    <div style={{ paddingTop: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleCreateUser}
                        disabled={creatingUser || !newUserName || !newUserEmail || !newUserPassword}
                        style={{ minWidth: '140px' }}
                      >
                        {creatingUser
                          ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />Creating…</>
                          : 'Create user'
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Roles & Permissions section (admin only) ── */}
              {section === 'roles' && role === 'admin' && (
                <div className="card">
                  <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <i className="fa-solid fa-user-gear icon-cyan" />
                    <h2>Roles & Permissions</h2>
                  </div>

                  {loadingUsers ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                      <i className="fa-solid fa-spinner fa-spin icon-cyan" />
                      <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading users…</p>
                    </div>
                  ) : allUsers.length === 0 ? (
                    <p style={{ fontSize: '0.875rem' }}>No users found.</p>
                  ) : (
                    <div className="table-container">
                      <table>
                        <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Actions</th>
                          <th>Permissions</th>
                        </tr>
                      </thead>
                        <tbody>
                          {allUsers.map((u) => (
                            <tr key={u.id}>
                              <td>{u.full_name ?? '—'}</td>
                              <td>{u.email}</td>
                              <td>
                                <select
                                  className="profile-input"
                                  value={u.role}
                                  disabled={savingUserId === u.id}
                                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
                                >
                                  <option value="employee">Employee</option>
                                  <option value="manager">Manager</option>
                                  <option value="leadership">Leadership</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </td>
                              <td>
                                <span style={{
                                  padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                                  background: u.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                                  color: u.is_active ? '#10b981' : '#f43f5e',
                                }}>
                                  {u.is_active ? 'Active' : 'Disabled'}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="btn btn-secondary"
                                  disabled={savingUserId === u.id}
                                  onClick={() => handleToggleActive(u)}
                                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                                >
                                  {savingUserId === u.id
                                    ? <i className="fa-solid fa-spinner fa-spin" />
                                    : u.is_active ? 'Disable' : 'Enable'
                                  }
                                </button>
                              </td>
                              <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {u.permissions.length === 0
                                    ? 'No access'
                                    : u.permissions.slice(0, 4).map(p => permCatalog[p] ?? p).join(', ') +
                                      (u.permissions.length > 4 ? ` +${u.permissions.length - 4} more` : '')}
                                </span>
                                <button className="btn btn-secondary" onClick={() => openPermissionsEditor(u)}
                                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                                  title="Edit permissions">
                                  <i className="fa-solid fa-pencil" />
                                </button>
                              </div>
                            </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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