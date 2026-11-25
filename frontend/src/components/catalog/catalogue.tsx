'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Input, Skeleton } from '@/components/ui/basic';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/overlay';
import { EmptyState, ErrorState, PaginationBar } from '@/components/common';
import { CategoryNav, CategorySelect, findNode, useCategoryTree } from '@/components/catalog/category-parts';
import { ProductCard } from '@/components/catalog/product-parts';
import { productService } from '@/services';

const SORTS: Record<string, { label: string; sortBy: string; order: string }> = {
  newest: { label: 'Newest first', sortBy: 'createdAt', order: 'desc' },
  'price-asc': { label: 'Price: low to high', sortBy: 'price', order: 'asc' },
  'price-desc': { label: 'Price: high to low', sortBy: 'price', order: 'desc' },
  'name-asc': { label: 'Name: A–Z', sortBy: 'name', order: 'asc' },
  'name-desc': { label: 'Name: Z–A', sortBy: 'name', order: 'desc' },
};
const LIMIT = 12;

function PriceFilter({ minPrice, maxPrice, onApply }: { minPrice: string; maxPrice: string; onApply: (min: string, max: string) => void }) {
  const [min, setMin] = useState(minPrice);
  const [max, setMax] = useState(maxPrice);
  return (
    <>
      <Input type="number" min={0} placeholder="Min price" value={min} onChange={(e) => setMin(e.target.value)} className="lg:w-28" aria-label="Minimum price" />
      <Input type="number" min={0} placeholder="Max price" value={max} onChange={(e) => setMax(e.target.value)} className="lg:w-28" aria-label="Maximum price" />
      <Button variant="outline" onClick={() => onApply(min, max)} className="h-9">Apply</Button>
    </>
  );
}

export function Catalogue() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const search = sp.get('search') ?? '';
  const category = sp.get('category') ?? undefined;
  const minPrice = sp.get('minPrice') ?? '';
  const maxPrice = sp.get('maxPrice') ?? '';
  const sort = sp.get('sort') && SORTS[sp.get('sort') as string] ? (sp.get('sort') as string) : 'newest';
  const page = Math.max(1, Number(sp.get('page')) || 1);

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const tree = useCategoryTree();
  const s = SORTS[sort];
  const products = useQuery({
    queryKey: ['catalogue', { search, category, minPrice, maxPrice, sort, page }],
    queryFn: () =>
      productService.list({
        search, category, minPrice, maxPrice, sortBy: s.sortBy, order: s.order, page, limit: LIMIT,
      }),
    placeholderData: (prev) => prev,
  });

  const selectedName = category && tree.data ? findNode(tree.data, category)?.name : undefined;
  const hasFilters = !!(search || category || minPrice || maxPrice);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <h2 className="mb-2 text-sm font-semibold">Categories</h2>
        {tree.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : tree.data ? (
          <CategoryNav tree={tree.data} selected={category} onSelect={(id) => update({ category: id })} />
        ) : null}
      </aside>

      <section>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="lg:hidden sm:col-span-2">
            {tree.data && (
              <CategorySelect
                tree={tree.data}
                value={category ?? null}
                onChange={(id) => update({ category: id ?? undefined })}
                allowNone
                noneLabel="All categories"
                placeholder="All categories"
              />
            )}
          </div>
          <Input
            placeholder="Search name or SKU"
            defaultValue={search}
            key={search}
            onKeyDown={(e) => { if (e.key === 'Enter') update({ search: e.currentTarget.value.trim() || undefined }); }}
            onBlur={(e) => { if (e.currentTarget.value.trim() !== search) update({ search: e.currentTarget.value.trim() || undefined }); }}
            aria-label="Search products"
          />
          <PriceFilter key={`${minPrice}-${maxPrice}`} minPrice={minPrice} maxPrice={maxPrice} onApply={(a, b) => update({ minPrice: a || undefined, maxPrice: b || undefined })} />
          <Select value={sort} onValueChange={(v) => update({ sort: v === 'newest' ? undefined : v })}>
            <SelectTrigger className="lg:w-48" aria-label="Sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <h1 className="text-xl font-bold">{selectedName ?? 'All products'}</h1>
          {products.data && <span className="text-muted-foreground">({products.data.meta.total} items)</span>}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
              <X /> Clear filters
            </Button>
          )}
        </div>

        {products.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="space-y-3 p-4"><Skeleton className="aspect-[4/3] w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-8 w-full" /></Card>
            ))}
          </div>
        ) : products.isError ? (
          <ErrorState message={products.error.message} onRetry={() => products.refetch()} />
        ) : products.data && products.data.items.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No products found"
            description="Try adjusting your search, category or price filters."
          />
        ) : products.data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.data.items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            <Card className="mt-6">
              <PaginationBar meta={products.data.meta} itemLabel="products" onPageChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
            </Card>
          </>
        ) : null}
      </section>
    </div>
  );
}
