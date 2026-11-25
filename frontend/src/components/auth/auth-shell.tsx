'use client';

import Link from 'next/link';
import { Boxes, ShieldCheck, ShoppingCart } from 'lucide-react';
import { Logo } from '@/components/common';
import { RedirectIfAuthed } from '@/components/auth/guards';

export function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <RedirectIfAuthed>
      <div className="flex min-h-screen">
        <div className="hidden w-[45%] flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
          <Link href="/"><Logo className="text-primary-foreground [&>span:first-child]:bg-primary-foreground [&>span:first-child]:text-primary" /></Link>
          <div className="space-y-6">
            <h1 className="text-4xl leading-tight font-bold tracking-tight">Everything you need,<br />in one place.</h1>
            <ul className="space-y-3 text-sm opacity-90">
              <li className="flex items-center gap-3"><ShoppingCart className="size-4" /> Browse products by nested categories</li>
              <li className="flex items-center gap-3"><Boxes className="size-4" /> Live stock and transparent pricing</li>
              <li className="flex items-center gap-3"><ShieldCheck className="size-4" /> Secure checkout and order tracking</li>
            </ul>
          </div>
          <p className="text-xs opacity-60">© ABC Ecommerce</p>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="lg:hidden"><Logo /></div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
            <p className="text-center text-sm text-muted-foreground">{footer}</p>
          </div>
        </div>
      </div>
    </RedirectIfAuthed>
  );
}
