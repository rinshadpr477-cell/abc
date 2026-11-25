'use client';

import Link from 'next/link';
import { ImageOff, Minus, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/basic';
import { Input } from '@/components/ui/basic';
import { useAuthStore } from '@/stores/auth.store';
import { useCartStore } from '@/stores/cart.store';
import { categoryName, money } from '@/lib/utils';
import type { Product } from '@/types';

export function PriceTag({ product, large = false }: { product: Pick<Product, 'price' | 'effectivePrice' | 'onSale'>; large?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={large ? 'text-2xl font-bold' : 'text-base font-semibold'}>{money(product.effectivePrice)}</span>
      {product.onSale && <span className="text-sm text-muted-foreground line-through">{money(product.price)}</span>}
    </div>
  );
}

export function StockBadge({ product }: { product: Pick<Product, 'inStock' | 'stock'> }) {
  if (!product.inStock) return <Badge variant="destructive">Out of stock</Badge>;
  if (product.stock <= 5) return <Badge variant="warning">Only {product.stock} left</Badge>;
  return <Badge variant="success">In stock</Badge>;
}

export function useAddToCart() {
  const add = useCartStore((s) => s.add);
  const role = useAuthStore((s) => s.user?.role);
  return (product: Pick<Product, 'id' | 'name'>, quantity = 1) => {
    if (role === 'ADMIN') {
      toast.info('Admin accounts cannot place orders. Use a customer account to shop.');
      return;
    }
    add(product.id, quantity);
    toast.success(`${product.name} added to cart`);
  };
}

export function ProductCard({ product }: { product: Product }) {
  const addToCart = useAddToCart();
  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={`/products/${product.id}`} className="flex aspect-[4/3] items-center justify-center bg-muted/50" aria-label={product.name}>
        <ImageOff className="size-8 text-muted-foreground/40" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs text-muted-foreground">{categoryName(product.category)}</p>
        <Link href={`/products/${product.id}`} className="line-clamp-2 font-medium hover:underline">{product.name}</Link>
        <div className="flex items-center justify-between gap-2">
          <PriceTag product={product} />
          <StockBadge product={product} />
        </div>
        <Button className="mt-auto" disabled={!product.inStock} onClick={() => addToCart(product)}>
          <ShoppingCart /> {product.inStock ? 'Add to cart' : 'Unavailable'}
        </Button>
      </div>
    </Card>
  );
}

export function QuantityStepper({
  value, onChange, max, disabled,
}: { value: number; onChange: (n: number) => void; max?: number; disabled?: boolean }) {
  const limit = max && max > 0 ? Math.min(max, 1000) : 1000;
  return (
    <div className="inline-flex items-center gap-1">
      <Button variant="outline" size="icon-sm" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="Decrease quantity">
        <Minus />
      </Button>
      <Input
        type="number"
        min={1}
        max={limit}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(limit, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
        className="h-7 w-14 px-1 text-center"
        aria-label="Quantity"
      />
      <Button variant="outline" size="icon-sm" disabled={disabled || value >= limit} onClick={() => onChange(value + 1)} aria-label="Increase quantity">
        <Plus />
      </Button>
    </div>
  );
}
