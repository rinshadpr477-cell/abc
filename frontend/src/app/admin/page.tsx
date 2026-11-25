'use client';

import { useQuery } from '@tanstack/react-query';
import { DollarSign, FolderTree, Hourglass, Package, ShoppingCart, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/basic';
import { ErrorState, ORDER_STATUSES, OrderStatusBadge, PageHeader } from '@/components/common';
import { orderService } from '@/services';
import { money } from '@/lib/utils';

function Stat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['admin-stats'], queryFn: orderService.stats });

  return (
    <div>
      <PageHeader title="Dashboard" description="Live figures from your store." />
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.isError || !q.data ? (
        <ErrorState message={q.error?.message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={Users} label="Total customers" value={String(q.data.totalCustomers)} />
            <Stat icon={UserCheck} label="Active customers" value={String(q.data.activeCustomers)} />
            <Stat icon={Package} label="Total products" value={String(q.data.totalProducts)} />
            <Stat icon={Package} label="Active products" value={String(q.data.activeProducts)} />
            <Stat icon={FolderTree} label="Categories" value={String(q.data.totalCategories)} />
            <Stat icon={ShoppingCart} label="Total orders" value={String(q.data.totalOrders)} />
            <Stat icon={Hourglass} label="Pending orders" value={String(q.data.pendingOrders)} />
            <Stat icon={DollarSign} label="Revenue" value={money(q.data.revenue)} hint="Excludes cancelled orders" />
          </div>
          <Card className="mt-6">
            <CardHeader><CardTitle>Orders by status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-6">
                {ORDER_STATUSES.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <OrderStatusBadge status={s} />
                    <span className="text-lg font-semibold">{q.data.ordersByStatus[s] ?? 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
