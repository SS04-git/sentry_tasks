'use client';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';

import { saveToken, removeToken } from '@/app/lib/auth';
import { jwtDecode } from 'jwt-decode';

interface User {
  email: string;
  role: string;
  full_name?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Both server and the first client render must produce the SAME output,
  // so we can't read localStorage (or anything window-only) in the
  // useState initializer — that's what caused the hydration mismatch.
  // Start "empty" on both sides, then resolve the real auth state inside
  // useEffect, which only ever runs on the client, after hydration.
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Resolve auth state on mount: OAuth redirect token takes priority,
  //    otherwise fall back to whatever's already in localStorage ───────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');

    if (tokenFromUrl) {
      try {
        const decoded: any = jwtDecode(tokenFromUrl);
        saveToken(tokenFromUrl);
        setUser({
          email: decoded.sub,
          role: decoded.role,
        });

        params.delete('token');
        const newUrl =
          window.location.pathname +
          (params.toString() ? `?${params.toString()}` : '');
        window.history.replaceState({}, '', newUrl);
      } catch (err) {
        console.error('Invalid token in URL:', err);
        removeToken();
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setUser({
          email: decoded.sub,
          role: decoded.role,
        });
      } catch {
        removeToken();
      }
    }

    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.detail || 'Invalid credentials');
  }

  saveToken(data.access_token);

  const decoded: any = jwtDecode(data.access_token);

  setUser({
    email: decoded.sub,
    role: decoded.role,
  });
};

  const logout = () => {
    removeToken();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      isLoading,
    }),
    [user, isLoading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};