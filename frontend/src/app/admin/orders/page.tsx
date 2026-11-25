'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/basic';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/overlay';
import { EmptyState, ErrorState, ORDER_STATUSES, OrderStatusBadge, PageHeader, PaginationBar, TableSkeleton, statusLabel, useDebounced } from '@/components/common';
import { formatDate, money } from '@/lib/utils';
import { orderService } from '@/services';

const ALL = 'all';

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const debounced = useDebounced(search);

  const q = useQuery({
    queryKey: ['admin-orders', { page, debounced, status }],
    queryFn: () => orderService.adminList({ page, limit: 10, search: debounced, status: status === ALL ? undefined : status }),
    placeholderData: (p) => p,
  });

  return (
    <div>
      <PageHeader title="Orders" description="Review orders and move them through fulfilment." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Input placeholder="Search order number, customer name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-sm" aria-label="Search orders" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-44" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        ) : !q.isLoading && q.data?.items.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders found" description="Orders will appear here as customers check out." />
        ) : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? <TableSkeleton columns={6} /> : q.data?.items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell>
                      {typeof o.customer === 'string' ? '—' : (<div><p className="font-medium">{o.customer.name}</p><p className="text-xs text-muted-foreground">{o.customer.email}</p></div>)}
                    </TableCell>
                    <TableCell>{formatDate(o.createdAt)}</TableCell>
                    <TableCell className="font-medium">{money(o.total)}</TableCell>
                    <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                    <TableCell><Button asChild variant="outline" size="sm"><Link href={`/admin/orders/${o.id}`}>Manage</Link></Button></TableCell>
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
