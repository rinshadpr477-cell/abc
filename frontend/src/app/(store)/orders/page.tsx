'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/basic';
import { EmptyState, ErrorState, OrderStatusBadge, PageHeader, PaginationBar, TableSkeleton } from '@/components/common';
import { RequireRole } from '@/components/auth/guards';
import { orderService } from '@/services';
import { formatDate, money } from '@/lib/utils';

function MyOrders() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['my-orders', page],
    queryFn: () => orderService.mine({ page, limit: 10 }),
    placeholderData: (p) => p,
  });

  return (
    <div>
      <PageHeader title="My orders" description="Track everything you have ordered." />
      <Card>
        {q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        ) : !q.isLoading && q.data?.items.length === 0 ? (
          <EmptyState icon={Package} title="No orders yet" description="When you place an order it will show up here." action={<Button asChild><Link href="/">Start shopping</Link></Button>} />
        ) : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? <TableSkeleton columns={6} /> : q.data?.items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell>{formatDate(o.createdAt)}</TableCell>
                    <TableCell>{o.items.reduce((n, i) => n + i.quantity, 0)}</TableCell>
                    <TableCell className="font-medium">{money(o.total)}</TableCell>
                    <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                    <TableCell><Button asChild variant="outline" size="sm"><Link href={`/orders/${o.id}`}>Details</Link></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {q.data && <PaginationBar meta={q.data.meta} itemLabel="orders" onPageChange={setPage} />}
          </>
        )}
      </Card>
    </div>
  );
}

export default function OrdersPage() {
  return <RequireRole role="CUSTOMER"><MyOrders /></RequireRole>;
}
