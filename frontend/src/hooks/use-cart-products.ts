'use client';

import { useQueries } from '@tanstack/react-query';
import { productService } from '@/services';
import { useCartStore } from '@/stores/cart.store';
import type { Product } from '@/types';

export type CartRowState = 'loading' | 'ok' | 'unavailable' | 'insufficient';

export interface CartRow {
  productId: string;
  quantity: number;
  product?: Product;
  state: CartRowState;
  /** Human-readable reason when the row can't be ordered as-is. */
  problem?: string;
}

/**
 * Cart lines hold only ids + quantities. Names, prices and stock are re-fetched from the API
 * so the display always reflects the current catalogue; the backend recomputes everything at checkout.
 */
export function useCartProducts() {
  const lines = useCartStore((s) => s.lines);
  const results = useQueries({
    queries: lines.map((l) => ({
      queryKey: ['cart-product', l.productId],
      queryFn: () => productService.get(l.productId, true),
      retry: false,
      staleTime: 0,
    })),
  });

  const rows: CartRow[] = lines.map((l, i) => {
    const r = results[i];
    if (!r || r.isLoading) return { ...l, state: 'loading' };
    const product = r.data;
    if (!product || r.isError) {
      return { ...l, state: 'unavailable', problem: 'This product is no longer available.' };
    }
    if (product.status !== 'ACTIVE' || !product.inStock) {
      return { ...l, product, state: 'unavailable', problem: 'Out of stock.' };
    }
    if (l.quantity > product.stock) {
      return { ...l, product, state: 'insufficient', problem: `Only ${product.stock} available.` };
    }
    return { ...l, product, state: 'ok' };
  });

  const loading = rows.some((r) => r.state === 'loading');
  const blocked = rows.some((r) => r.state === 'unavailable' || r.state === 'insufficient');
  /** Display-only estimate; the authoritative total is computed by the backend. */
  const estimate = rows.reduce((sum, r) => sum + (r.product ? r.product.effectivePrice * r.quantity : 0), 0);
  return { rows, loading, blocked, estimate };
}
