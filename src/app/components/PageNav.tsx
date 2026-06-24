'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';

export default function PageNav({ active }: { active?: string }) {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'employee';
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (tab: string) =>
    active ? active === tab : pathname?.startsWith(`/${tab}`);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const goToProfile = (section: 'profile' | 'password') => {
    setProfileOpen(false);
    router.push(`/profile?section=${section}`);
  };

  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-logo">
          <div className="nav-logo-icon">
            <i className="fa-solid fa-shield-halved icon-white icon-md"></i>
          </div>
          <span className="nav-logo-text">Sentry</span>
        </div>

        <div className="nav-links">
          <Link href="/dashboard" className={`nav-link ${isActive('dashboard') ? 'active' : ''}`}>
            <i className="fa-solid fa-gauge icon-sm" style={{ marginRight: '0.4rem' }}></i>Dashboard
          </Link>
          <Link href="/repositories" className={`nav-link ${isActive('repositories') ? 'active' : ''}`}>
            <i className="fa-solid fa-code-branch icon-sm" style={{ marginRight: '0.4rem' }}></i>Repositories
          </Link>
          {['admin', 'leadership', 'manager'].includes(role) && (
            <Link href="/reports" className={`nav-link ${isActive('reports') ? 'active' : ''}`}>
              <i className="fa-solid fa-chart-bar icon-sm" style={{ marginRight: '0.4rem' }}></i>Reports
            </Link>
          )}
          {['admin'].includes(role) && (
            <Link href="/admin" className={`nav-link ${isActive('admin') ? 'active' : ''}`}>
              <i className="fa-solid fa-screwdriver-wrench icon-sm" style={{ marginRight: '0.4rem' }}></i>Admin
            </Link>
          )}
        </div>

        <div className="nav-user">
          <div className="nav-notification">
            <i className="fa-solid fa-bell icon-cyan"></i>
          </div>

          <div className="profile-trigger" ref={profileRef} onClick={() => setProfileOpen(!profileOpen)}>
            <i className="fa-solid fa-circle-user icon-cyan"></i>

            {profileOpen && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-header">
                  <div className="profile-dropdown-avatar">
                    <i className="fa-solid fa-user"></i>
                  </div>
                  <div className="profile-dropdown-info">
                    <span className="profile-dropdown-email">{user?.email}</span>
                    <span className="profile-dropdown-role">{role}</span>
                  </div>
                </div>

                <div
                  className="profile-dropdown-item"
                  onClick={() => goToProfile('profile')}
                >
                  <i className="fa-solid fa-user-gear icon-sm"></i>
                  Profile Settings
                </div>

                <div
                  className="profile-dropdown-item"
                  onClick={() => goToProfile('password')}
                >
                  <i className="fa-solid fa-lock icon-sm"></i>
                  Change Password
                </div>

                <div className="profile-dropdown-item danger" onClick={logout}>
                  <i className="fa-solid fa-arrow-right-from-bracket icon-sm"></i>
                  Log Out
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}