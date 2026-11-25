'use client';

import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/basic';
import { OrderStatusBadge } from '@/components/common';
import { formatDate, money } from '@/lib/utils';
import type { Order } from '@/types';

/** Shared read-only order body (items, price breakdown, status history) for customer and admin pages. */
export function OrderBody({ order }: { order: Order }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Line total</TableHead></TableRow></TableHeader>
            <TableBody>
              {order.items.map((i) => (
                <TableRow key={i.product}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                  <TableCell className="text-right">{money(i.unitPrice)}</TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  <TableCell className="text-right">{money(i.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(order.subtotal)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{money(order.total)}</span></div>
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {[...order.statusHistory].reverse().map((h, idx) => (
              <li key={`${h.status}-${h.at}-${idx}`} className="text-sm">
                <OrderStatusBadge status={h.status} />
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(h.at)}{h.note ? ` · ${h.note}` : ''}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
