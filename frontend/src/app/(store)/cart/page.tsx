'use client';

import Link from 'next/link';
import { AlertTriangle, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/basic';
import { EmptyState, PageHeader } from '@/components/common';
import { PriceTag, QuantityStepper } from '@/components/catalog/product-parts';
import { useCartProducts } from '@/hooks/use-cart-products';
import { useCartStore } from '@/stores/cart.store';
import { useAuthStore } from '@/stores/auth.store';
import { money } from '@/lib/utils';

export default function CartPage() {
  const { rows, loading, blocked, estimate } = useCartProducts();
  const { setQuantity, remove, clear } = useCartStore();
  const role = useAuthStore((s) => s.user?.role);

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Browse the catalogue and add something you like."
          action={<Button asChild><Link href="/">Continue shopping</Link></Button>}
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Shopping cart"
        description="Prices and stock shown here are current catalogue values. Your final total is calculated by the server at checkout."
        actions={<Button variant="ghost" size="sm" onClick={clear}>Clear cart</Button>}
      />
      {role === 'ADMIN' && (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          You are signed in as an admin. Admin accounts cannot place orders.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Product</TableHead><TableHead>Price</TableHead><TableHead>Quantity</TableHead><TableHead className="text-right">Line total</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.productId}>
                  <TableCell>
                    {r.state === 'loading' ? <Skeleton className="h-4 w-40" /> : r.product ? (
                      <div>
                        <Link href={`/products/${r.productId}`} className="font-medium hover:underline">{r.product.name}</Link>
                        <p className="text-xs text-muted-foreground">SKU {r.product.sku}</p>
                      </div>
                    ) : <span className="text-muted-foreground">Unknown product</span>}
                    {r.problem && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> {r.problem}</p>
                    )}
                  </TableCell>
                  <TableCell>{r.product ? <PriceTag product={r.product} /> : '—'}</TableCell>
                  <TableCell>
                    <QuantityStepper value={r.quantity} onChange={(n) => setQuantity(r.productId, n)} max={r.product?.stock} disabled={r.state === 'unavailable'} />
                  </TableCell>
                  <TableCell className="text-right">{r.product && r.state !== 'unavailable' ? money(r.product.effectivePrice * r.quantity) : '—'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove item" onClick={() => remove(r.productId)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card className="h-fit space-y-3 p-4">
          <h2 className="font-semibold">Order summary</h2>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Estimated total</span><span className="text-lg font-bold">{loading ? '…' : money(estimate)}</span></div>
          {blocked && <p className="text-xs text-destructive">Fix or remove the highlighted items to continue.</p>}
          <Button asChild size="lg" className="w-full" aria-disabled={loading || blocked || role === 'ADMIN'}>
            <Link
              href="/checkout"
              onClick={(e) => { if (loading || blocked || role === 'ADMIN') e.preventDefault(); }}
              className={loading || blocked || role === 'ADMIN' ? 'pointer-events-none opacity-50' : undefined}
            >
              Proceed to checkout
            </Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
