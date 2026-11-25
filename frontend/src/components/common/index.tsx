'use client';

import * as React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, ShoppingBag, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Label, Skeleton, TableCell, TableRow } from '@/components/ui/basic';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle,
} from '@/components/ui/overlay';
import { APP_NAME, cn } from '@/lib/utils';
import type { OrderStatus, PageMeta } from '@/types';

/** Brand mark + wordmark. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShoppingBag className="size-4" />
      </span>
      {!compact && <span>{APP_NAME}</span>}
    </span>
  );
}

export function PaginationBar({
  meta, itemLabel = 'records', onPageChange,
}: { meta: PageMeta; itemLabel?: string; onPageChange: (page: number) => void }) {
  if (meta.total === 0) return null;
  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}-{end}</span> of{' '}
        <span className="font-medium text-foreground">{meta.total}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!meta.hasPreviousPage} onClick={() => onPageChange(meta.page - 1)}>
          <ChevronLeft /> Previous
        </Button>
        <span className="px-1 text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
        <Button variant="outline" size="sm" disabled={!meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, description, action,
}: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/30">
        <Icon className="size-8 text-muted-foreground/50" />
      </div>
      <h3 className="mb-1 text-base font-bold">{title}</h3>
      {description && <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message || 'Something went wrong while loading this data.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((__, c) => (
            <TableCell key={c}><Skeleton className="h-4 w-full max-w-32" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive = false, busy = false, error, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="grid gap-1.5">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            onClick={(e) => {
              e.preventDefault(); // keep the dialog open until the caller decides
              onConfirm();
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Field({
  label, error, htmlFor, children, hint,
}: { label: string; error?: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

const STATUS: Record<OrderStatus, { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
  PENDING: { label: 'Pending', variant: 'info' },
  CONFIRMED: { label: 'Confirmed', variant: 'purple' },
  PROCESSING: { label: 'Processing', variant: 'warning' },
  SHIPPED: { label: 'Shipped', variant: 'info' },
  DELIVERED: { label: 'Delivered', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant} className="font-bold tracking-wide uppercase">{s.label}</Badge>;
}

export const ORDER_STATUSES = Object.keys(STATUS) as OrderStatus[];
export const statusLabel = (s: OrderStatus) => STATUS[s].label;

/** Admin transitions (mirrors the backend workflow). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Simple debounced value for search boxes. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
