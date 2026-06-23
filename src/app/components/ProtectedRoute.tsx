'use client';

import { useAuth } from '@/app/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Don't make any redirect decision until AuthProvider has actually
    // finished resolving auth state. Without this guard, this effect can
    // (and does) fire before AuthProvider's own effect has run — since
    // child effects run before parent effects — and sees user === null
    // simply because it hasn't been resolved yet, not because the person
    // is actually logged out. That was causing the redirect-to-login loop.
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <div>Loading...</div>;
  if (!user) return null;

  return <>{children}</>;
}