'use client';

import { useState, useSyncExternalStore, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, Package, Search, ShoppingCart, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/basic';
import { Logo } from '@/components/common';
import { authService } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import { selectCartCount, useCartStore } from '@/stores/cart.store';
import { APP_NAME } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/theme-toggle';

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('search') ?? '');
  return (
    <form
      className="relative hidden max-w-md flex-1 sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/?search=${encodeURIComponent(q.trim())}` : '/');
      }}
      role="search"
    >
      <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products or SKU…" className="pl-8" aria-label="Search products" />
    </form>
  );
}

export function StoreShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const count = useCartStore(selectCartCount);
  // false during SSR/hydration, true afterwards (avoids a persisted-cart hydration mismatch)
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);

  const logout = async () => {
    await authService.logout().catch(() => undefined);
    useAuthStore.getState().clear();
    qc.clear();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link href="/" aria-label={`${APP_NAME} home`}><Logo /></Link>
          <Suspense fallback={<div className="hidden flex-1 sm:block" />}>
            <SearchBox />
          </Suspense>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className="mr-1" />
            {user?.role !== 'ADMIN' && (
              <Button asChild variant="ghost" size="icon" aria-label="Cart">
                <Link href="/cart" className="relative">
                  <ShoppingCart />
                  {mounted && count > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </Link>
              </Button>
            )}
            {!ready ? null : user ? (
              <>
                {user.role === 'ADMIN' ? (
                  <Button asChild variant="outline" size="sm"><Link href="/admin"><LayoutDashboard /> Admin</Link></Button>
                ) : (
                  <>
                    <Button asChild variant="ghost" size="sm"><Link href="/orders"><Package /> Orders</Link></Button>
                    <Button asChild variant="ghost" size="sm"><Link href="/profile"><UserIcon /> {user.name.split(' ')[0]}</Link></Button>
                  </>
                )}
                <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out"><LogOut /></Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
                <Button asChild size="sm"><Link href="/register">Register</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
