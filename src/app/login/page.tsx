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
    <main className="auth-page">
      <div className="auth-box">

        <div className="auth-header">
          <div className="auth-icon">
            <i className="fa-solid fa-shield-halved icon-white" style={{ fontSize: '1.6rem' }}></i>
          </div>
          <h1>Sentry</h1>
          <p>Sign in to access your workspace</p>
        </div>

        <div className="card" style={{ padding: '2rem' }}>

          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="form-group">
              <div className="field">
                <label>
                  <i className="fa-solid fa-envelope icon-slate icon-sm" style={{ marginRight: '0.4rem' }}></i>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label>
                  <i className="fa-solid fa-lock icon-slate icon-sm" style={{ marginRight: '0.4rem' }}></i>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <p style={{ color: '#f43f5e', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <i className="fa-solid fa-circle-exclamation"></i>
                  {error}
                </p>
              )}

              <button type="submit" disabled={isLoading} style={{ marginTop: '0.5rem' }}>
                {isLoading
                  ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }}></i>Signing in...</>
                  : <><i className="fa-solid fa-arrow-right-to-bracket" style={{ marginRight: '0.5rem' }}></i>Sign in</>
                }
              </button>
            </div>
          </form>
        </div>

        <p className="auth-footer">
          <i className="fa-solid fa-shield-halved icon-slate icon-sm" style={{ marginRight: '0.4rem' }}></i>
          Protected by enterprise-grade security
        </p>

      </div>
    </main>
  );
}