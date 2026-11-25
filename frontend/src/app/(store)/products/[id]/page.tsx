'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ImageOff, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/basic';
import { ErrorState } from '@/components/common';
import { PriceTag, QuantityStepper, StockBadge, useAddToCart } from '@/components/catalog/product-parts';
import { productService } from '@/services';
import { categoryName } from '@/lib/utils';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const addToCart = useAddToCart();
  const [qty, setQty] = useState(1);
  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.get(id),
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !product) return <ErrorState message={error?.message ?? 'Product not found'} onRetry={() => refetch()} />;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4"><ArrowLeft /> Back</Button>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex aspect-square items-center justify-center rounded-xl bg-muted/50">
          <ImageOff className="size-12 text-muted-foreground/40" />
        </div>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <Link href={`/?category=${typeof product.category === 'string' ? product.category : (product.category.id ?? product.category._id ?? '')}`} className="hover:underline">
              {categoryName(product.category)}
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
          <PriceTag product={product} large />
          <StockBadge product={product} />
          {product.description && <p className="whitespace-pre-line text-sm leading-relaxed">{product.description}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <QuantityStepper value={qty} onChange={setQty} max={product.stock} disabled={!product.inStock} />
            <Button size="lg" disabled={!product.inStock} onClick={() => addToCart(product, qty)}>
              <ShoppingCart /> Add to cart
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
