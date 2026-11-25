'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/basic';
import { OrderStatusBadge, PageHeader } from '@/components/common';
import { RequireRole } from '@/components/auth/guards';
import { useCartProducts } from '@/hooks/use-cart-products';
import { ApiError } from '@/lib/api';
import { money, newIdempotencyKey } from '@/lib/utils';
import { orderService } from '@/services';
import { useCartStore } from '@/stores/cart.store';
import type { Order } from '@/types';

function Checkout() {
  const qc = useQueryClient();
  const { rows, loading, blocked, estimate } = useCartProducts();
  const clearCart = useCartStore((s) => s.clear);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  // One idempotency key per distinct cart; reused on retries so a double-click can never create two orders.
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  if (placed) {
    return (
      <Card className="mx-auto max-w-2xl space-y-4 p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
        <h1 className="text-2xl font-bold">Thank you! Your order is placed.</h1>
        <p className="text-muted-foreground">Order <span className="font-mono font-medium text-foreground">{placed.orderNumber}</span> · <OrderStatusBadge status={placed.status} /></p>
        <div className="mx-auto max-w-sm space-y-1 rounded-lg bg-muted/40 p-4 text-left text-sm">
          {placed.items.map((i) => (
            <div key={i.product} className="flex justify-between"><span>{i.name} × {i.quantity}</span><span>{money(i.lineTotal)}</span></div>
          ))}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{money(placed.total)}</span></div>
        </div>
        <div className="flex justify-center gap-2">
          <Button asChild><Link href={`/orders/${placed.id}`}>View order</Link></Button>
          <Button asChild variant="outline"><Link href="/">Continue shopping</Link></Button>
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="mb-4 text-muted-foreground">Your cart is empty.</p>
        <Button asChild><Link href="/">Browse products</Link></Button>
      </Card>
    );
  }

  const place = async () => {
    setError(null);
    setPlacing(true);
    const items = rows.map((r) => ({ productId: r.productId, quantity: r.quantity })); // ids + quantities only
    const sig = JSON.stringify(items);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey() };
    try {
      const order = await orderService.place(items, keyRef.current.key);
      keyRef.current = null;
      clearCart();
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      qc.invalidateQueries({ queryKey: ['cart-product'] });
      setPlaced(order);
      toast.success('Order placed');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not place your order';
      setError(msg);
      toast.error(msg);
      qc.invalidateQueries({ queryKey: ['cart-product'] }); // refresh stock/prices after a stock or availability failure
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Checkout" description="Review your items. Final prices and stock are verified by the server when you place the order." />
      <Card className="mb-4 divide-y">
        {rows.map((r) => (
          <div key={r.productId} className="flex items-center justify-between gap-4 p-4 text-sm">
            <div>
              <p className="font-medium">{r.product?.name ?? 'Product'}</p>
              <p className="text-muted-foreground">Qty {r.quantity}{r.product ? ` × ${money(r.product.effectivePrice)}` : ''}</p>
              {r.problem && <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> {r.problem}</p>}
            </div>
            <span className="font-medium">{r.product && r.state === 'ok' ? money(r.product.effectivePrice * r.quantity) : '—'}</span>
          </div>
        ))}
        <div className="flex justify-between p-4 font-semibold"><span>Estimated total</span><span>{loading ? '…' : money(estimate)}</span></div>
      </Card>
      {error && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {blocked && (
        <p className="mb-4 text-sm text-destructive">Some items are unavailable. <Link href="/cart" className="underline">Update your cart</Link> to continue.</p>
      )}
      <div className="flex justify-between">
        <Button asChild variant="outline"><Link href="/cart">Back to cart</Link></Button>
        <Button size="lg" onClick={place} disabled={placing || loading || blocked}>
          {placing && <Loader2 className="animate-spin" />} Place order
        </Button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireRole role="CUSTOMER">
      <Checkout />
    </RequireRole>
  );
}
