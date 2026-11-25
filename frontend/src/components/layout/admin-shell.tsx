'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FolderTree, LayoutDashboard, LogOut, Menu, Package, ShoppingCart, Store, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/common';
import { RequireRole } from '@/components/auth/guards';
import { authService } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/theme-toggle';

const NAV: { title: string; href: string; icon: LucideIcon }[] = [
  { title: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Categories', href: '/admin/categories', icon: FolderTree },
  { title: 'Products', href: '/admin/products', icon: Package },
  { title: 'Orders', href: '/admin/orders', icon: ShoppingCart },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  const active = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));
  const logout = async () => {
    await authService.logout().catch(() => undefined);
    useAuthStore.getState().clear();
    qc.clear();
    router.push('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center border-b px-4"><Logo /></div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Admin">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent',
                active(n.href) && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
              )}
            >
              <n.icon className="size-4" /> {n.title}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
            <Store className="size-4" /> View storefront
          </Link>
        </div>
      </aside>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <p className="text-sm font-medium text-muted-foreground">ABC Ecommerce · Admin</p>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-sm sm:inline">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={logout}><LogOut /> Sign out</Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="ADMIN">
      <Shell>{children}</Shell>
    </RequireRole>
  );
}
