'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from '@/components/ui/basic';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/overlay';
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, PaginationBar, TableSkeleton, useDebounced } from '@/components/common';
import { CategorySelect, useCategoryTree } from '@/components/catalog/category-parts';
import { PriceTag } from '@/components/catalog/product-parts';
import { ApiError, type FieldError } from '@/lib/api';
import { categoryId, categoryName } from '@/lib/utils';
import { productService, type ProductInput } from '@/services';
import type { Product, ProductStatus } from '@/types';

const ALL = 'all';

interface FormState {
  id?: string;
  name: string;
  sku: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  category: string | null;
  status: ProductStatus;
}

const emptyForm: FormState = { name: '', sku: '', description: '', price: '', salePrice: '', stock: '0', category: null, status: 'ACTIVE' };

function validate(f: FormState): { errors: Record<string, string>; body?: ProductInput } {
  const errors: Record<string, string> = {};
  if (f.name.trim().length < 2) errors.name = 'At least 2 characters';
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(f.sku.trim())) errors.sku = '2–64 chars: letters, digits, . _ -';
  const price = Number(f.price);
  if (f.price === '' || !Number.isFinite(price) || price < 0) errors.price = 'Enter a valid price';
  let salePrice: number | null = null;
  if (f.salePrice !== '') {
    salePrice = Number(f.salePrice);
    if (!Number.isFinite(salePrice) || salePrice < 0) errors.salePrice = 'Enter a valid sale price';
    else if (!errors.price && salePrice >= price) errors.salePrice = 'Must be lower than price';
  }
  const stock = Number(f.stock);
  if (f.stock === '' || !Number.isInteger(stock) || stock < 0) errors.stock = 'Whole number, 0 or more';
  if (!f.category) errors.category = 'Choose a category';
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    body: {
      name: f.name.trim(), sku: f.sku.trim(), description: f.description.trim(),
      price, salePrice, stock, category: f.category!, status: f.status,
    },
  };
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const tree = useCategoryTree(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState(ALL);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const debounced = useDebounced(search);

  const q = useQuery({
    queryKey: ['admin-products', { page, debounced, category, status }],
    queryFn: () =>
      productService.list({ page, limit: 10, search: debounced, category: category ?? undefined, status: status === ALL ? undefined : status, sortBy: 'createdAt', order: 'desc' }),
    placeholderData: (p) => p,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-products'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
    qc.invalidateQueries({ queryKey: ['catalogue'] });
  };

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ProductInput }) => (id ? productService.update(id, body) : productService.create(body)),
    onSuccess: (_d, v) => { toast.success(v.id ? 'Product updated' : 'Product created'); setForm(null); refresh(); },
    onError: (e) => {
      if (e instanceof ApiError) {
        const fe: Record<string, string> = {};
        e.errors?.forEach((x: FieldError) => { if (x.field) fe[x.field] = x.message; });
        if (e.code === 'DUPLICATE_SKU') fe.sku = e.message;
        setErrors(fe);
        setFormError(e.message);
      }
    },
  });

  const remove = useMutation({
    mutationFn: (p: Product) => productService.remove(p.id),
    onSuccess: (r) => { toast.success(r.deleted ? 'Product deleted' : 'Product has orders, so it was deactivated instead'); setDel(null); refresh(); },
    onError: (e) => setDelError(e instanceof ApiError ? e.message : 'Could not delete the product'),
  });

  const openCreate = () => { setErrors({}); setFormError(null); setForm({ ...emptyForm }); };
  const openEdit = (p: Product) => {
    setErrors({}); setFormError(null);
    setForm({
      id: p.id, name: p.name, sku: p.sku, description: p.description ?? '', price: String(p.price),
      salePrice: p.salePrice != null ? String(p.salePrice) : '', stock: String(p.stock), category: categoryId(p.category), status: p.status,
    });
  };
  const submit = () => {
    if (!form) return;
    const { errors: errs, body } = validate(form);
    setErrors(errs);
    setFormError(null);
    if (body) save.mutate({ id: form.id, body });
  };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => form && setForm({ ...form, [k]: v });
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      <PageHeader title="Products" description="Manage your catalogue and stock." actions={<Button onClick={openCreate}><Plus /> Add product</Button>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Input placeholder="Search name or SKU" value={search} onChange={(e) => reset(() => setSearch(e.target.value))} className="max-w-xs" aria-label="Search products" />
          <div className="w-56">
            {tree.data && (
              <CategorySelect tree={tree.data} value={category} onChange={(id) => reset(() => setCategory(id))} allowNone noneLabel="All categories" placeholder="All categories" onlyActive={false} />
            )}
          </div>
          <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
            <SelectTrigger className="w-36" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All statuses</SelectItem><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem></SelectContent>
          </Select>
        </div>
        {q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        ) : !q.isLoading && q.data?.items.length === 0 ? (
          <EmptyState icon={Package} title="No products found" description="Adjust the filters or add a new product." action={<Button onClick={openCreate}><Plus /> Add product</Button>} />
        ) : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? <TableSkeleton columns={7} /> : q.data?.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>{categoryName(p.category)}</TableCell>
                    <TableCell><PriceTag product={p} /></TableCell>
                    <TableCell><Badge variant={p.stock === 0 ? 'destructive' : p.stock <= 5 ? 'warning' : 'secondary'}>{p.stock}</Badge></TableCell>
                    <TableCell><Badge variant={p.status === 'ACTIVE' ? 'success' : 'secondary'}>{p.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => { setDelError(null); setDel(p); }} aria-label={`Delete ${p.name}`}><Trash2 className="text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {q.data && <PaginationBar meta={q.data.meta} itemLabel="products" onPageChange={setPage} />}
          </>
        )}
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-xl">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{form.id ? 'Edit product' : 'Add product'}</DialogTitle>
                <DialogDescription>Prices are in USD. Sale price must be lower than the regular price.</DialogDescription>
              </DialogHeader>
              {formError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Name" htmlFor="p-name" error={errors.name}><Input id="p-name" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field></div>
                <Field label="SKU" htmlFor="p-sku" error={errors.sku}><Input id="p-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
                <Field label="Category" htmlFor="p-cat" error={errors.category}>
                  {tree.data && <CategorySelect id="p-cat" tree={tree.data} value={form.category} onChange={(c) => set('category', c)} />}
                </Field>
                <Field label="Price" htmlFor="p-price" error={errors.price}><Input id="p-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} /></Field>
                <Field label="Sale price (optional)" htmlFor="p-sale" error={errors.salePrice}><Input id="p-sale" type="number" min={0} step="0.01" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} /></Field>
                <Field label="Stock" htmlFor="p-stock" error={errors.stock}><Input id="p-stock" type="number" min={0} step={1} value={form.stock} onChange={(e) => set('stock', e.target.value)} /></Field>
                <Field label="Status" htmlFor="p-status">
                  <Select value={form.status} onValueChange={(v) => set('status', v as ProductStatus)}>
                    <SelectTrigger id="p-status"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem></SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2"><Field label="Description" htmlFor="p-desc"><Textarea id="p-desc" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save product'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete “${del?.name ?? ''}”?`}
        description="Products that were never ordered are removed permanently. Products with order history are deactivated instead so past orders stay intact."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        error={delError}
        onConfirm={() => del && remove.mutate(del)}
      />
    </div>
  );
}
