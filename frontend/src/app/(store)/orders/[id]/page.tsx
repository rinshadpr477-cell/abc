'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/basic';
import { ConfirmDialog, ErrorState, OrderStatusBadge } from '@/components/common';
import { RequireRole } from '@/components/auth/guards';
import { OrderBody } from '@/components/catalog/order-view';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { orderService } from '@/services';

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['order', id], queryFn: () => orderService.get(id), retry: false });
  const cancel = useMutation({
    mutationFn: () => orderService.cancel(id),
    onSuccess: () => {
      toast.success('Order cancelled');
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not cancel the order'),
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError || !q.data) return <ErrorState message={q.error?.message ?? 'Order not found'} />;
  const order = q.data;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm"><Link href="/orders"><ArrowLeft /> All orders</Link></Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">Placed {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {order.status === 'PENDING' && (
            <Button variant="destructive" onClick={() => { setErr(null); setConfirm(true); }}>Cancel order</Button>
          )}
        </div>
      </div>
      <OrderBody order={order} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel this order?"
        description="The reserved stock will be released. This cannot be undone."
        confirmLabel="Cancel order"
        destructive
        busy={cancel.isPending}
        error={err}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}

export default function OrderDetailPage() {
  return <RequireRole role="CUSTOMER"><OrderDetail /></RequireRole>;
}
