'use client';

import { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-layout">

  <div className="auth-left">

    <div className="auth-brand">
      <div className="auth-brand-icon">
        <i className="fa-solid fa-shield-halved"></i>
      </div>

      <div>
        <h1 className="auth-brand-title">Sentry</h1>
        <p className="auth-brand-subtitle">
          Internal Security Monitoring Platform
        </p>
      </div>
    </div>

    <div className="auth-hero">
      <span className="hero-badge">
        Enterprise Security
      </span>

      <h2>
        Monitor access, audit activity,
        and protect your organization.
      </h2>

      <p>
        Centralized dashboard for security teams,
        managers and administrators.
      </p>

      <div className="hero-features">

        <div className="hero-feature">
          <i className="fa-solid fa-user-shield"></i>
          Role-based access control
        </div>

        <div className="hero-feature">
          <i className="fa-solid fa-clipboard-check"></i>
          Audit logging
        </div>

        <div className="hero-feature">
          <i className="fa-solid fa-shield-virus"></i>
          Security monitoring
        </div>

      </div>
    </div>

  </div>

  <div className="auth-right">

    <div className="auth-login-card">

      <div className="auth-form-header">
        <h2>Welcome Back</h2>
        <p>Sign in to continue to Sentry</p>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off">

        <div className="form-group">

          <div className="field">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@sentry.com"
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="error-msg">
              <i className="fa-solid fa-circle-exclamation"></i>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="auth-submit"
          >
            {isLoading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Signing In...
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-right-to-bracket"></i>
                Sign In
              </>
            )}
          </button>

        </div>

      </form>

      <div className="auth-security-note">
        <i className="fa-solid fa-lock"></i>
        Protected by enterprise-grade security
      </div>

    </div>

  </div>

</main>
  );
}