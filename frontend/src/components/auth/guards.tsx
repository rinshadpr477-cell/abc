'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import type { Role } from '@/types';

export const homeFor = (role: Role) => (role === 'ADMIN' ? '/admin' : '/');

export function FullPageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * UX-only route guard (the backend is the real authorization).
 * - not signed in → /login?next=…
 * - wrong role → that role's home
 */
export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, ready } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== role) router.replace(homeFor(user.role));
  }, [ready, user, role, router, pathname]);

  if (!ready || !user || user.role !== role) return <FullPageLoader />;
  return <>{children}</>;
}

/** Login/register pages: signed-in users are sent away. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuthStore();
  const router = useRouter();
  useEffect(() => {
    if (ready && user) {
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(user.role));
    }
  }, [ready, user, router]);
  if (!ready || user) return <FullPageLoader />;
  return <>{children}</>;
}
