'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { refreshSession } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

/** Restores the session on page load via the HttpOnly refresh cookie (access token is memory-only). */
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    refreshSession().finally(() => useAuthStore.getState().setReady());
  }, []);
  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthBootstrap>{children}</AuthBootstrap>
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
