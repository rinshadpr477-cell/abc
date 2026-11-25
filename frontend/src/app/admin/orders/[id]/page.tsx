'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@/components/ui/basic';
import { ConfirmDialog, ErrorState, NEXT_STATUSES, OrderStatusBadge, statusLabel } from '@/components/common';
import { OrderBody } from '@/components/catalog/order-view';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { orderService } from '@/services';
import type { OrderStatus } from '@/types';

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['order', id], queryFn: () => orderService.get(id), retry: false });

  const update = useMutation({
    mutationFn: (s: OrderStatus) => orderService.adminSetStatus(id, s, note.trim()),
    onSuccess: (o) => {
      toast.success(`Order marked ${statusLabel(o.status)}`);
      setTarget(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not update the order'),
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError || !q.data) return <ErrorState message={q.error?.message ?? 'Order not found'} />;
  const order = q.data;
  const customer = typeof order.customer === 'string' ? null : order.customer;
  const next = NEXT_STATUSES[order.status];

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/orders"><ArrowLeft /> All orders</Link></Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">Placed {formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {customer ? (<><p className="font-medium">{customer.name}</p><p className="text-muted-foreground">{customer.email}</p></>) : <p className="text-muted-foreground">Unavailable</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Update status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {next.length === 0 ? (
              <p className="text-sm text-muted-foreground">This order is {statusLabel(order.status).toLowerCase()} and can no longer change.</p>
            ) : (
              <>
                <Input placeholder="Optional note for the history" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Status note" />
                <div className="flex flex-wrap gap-2">
                  {next.map((s) => (
                    <Button key={s} variant={s === 'CANCELLED' ? 'destructive' : 'default'} onClick={() => { setErr(null); setTarget(s); }}>
                      {s === 'CANCELLED' ? 'Cancel order' : `Mark ${statusLabel(s)}`}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <OrderBody order={order} />

      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target === 'CANCELLED' ? 'Cancel this order?' : `Mark order as ${target ? statusLabel(target) : ''}?`}
        description={target === 'CANCELLED' ? 'Reserved stock is returned to inventory exactly once. This cannot be undone.' : 'The customer will see the new status.'}
        confirmLabel="Confirm"
        destructive={target === 'CANCELLED'}
        busy={update.isPending}
        error={err}
        onConfirm={() => target && update.mutate(target)}
      />
    </div>
  );
}
