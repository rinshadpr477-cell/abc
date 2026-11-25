'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderPlus, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, Input, Skeleton, Switch, Textarea } from '@/components/ui/basic';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlay';
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader } from '@/components/common';
import { CategorySelect, findNode, useCategoryTree } from '@/components/catalog/category-parts';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { categoryService } from '@/services';
import type { CategoryNode } from '@/types';

/** Keep nodes whose name matches, or that have a matching descendant. */
function filterTree(nodes: CategoryNode[], term: string): CategoryNode[] {
  const t = term.toLowerCase();
  const out: CategoryNode[] = [];
  for (const n of nodes) {
    const kids = filterTree(n.children, term);
    if (n.name.toLowerCase().includes(t) || kids.length) out.push({ ...n, children: n.name.toLowerCase().includes(t) && !kids.length ? n.children : kids });
  }
  return out;
}

interface FormState {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  description: string;
  parent: string | null;
  isActive: boolean;
}

function Row({
  node, depth, forceOpen, onAdd, onEdit, onToggle, onDelete,
}: {
  node: CategoryNode;
  depth: number;
  forceOpen: boolean;
  onAdd: (n: CategoryNode) => void;
  onEdit: (n: CategoryNode) => void;
  onToggle: (n: CategoryNode) => void;
  onDelete: (n: CategoryNode) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const expanded = open || forceOpen;
  const has = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center gap-2 border-b py-2 pr-3 hover:bg-muted/40" style={{ paddingLeft: 12 + Math.min(depth, 12) * 20 }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className={cn('flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted', !has && 'invisible')}
        >
          <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <span className={cn('font-medium', !node.isActive && 'text-muted-foreground line-through')}>{node.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">/{node.slug}</span>
          {!node.isActive && <Badge variant="destructive" className="ml-2">Inactive</Badge>}
          {has && <Badge variant="secondary" className="ml-2">{node.children.length} sub</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={node.isActive} onCheckedChange={() => onToggle(node)} aria-label={`Toggle ${node.name} active`} />
          <Button variant="ghost" size="icon-sm" onClick={() => onAdd(node)} aria-label={`Add child to ${node.name}`} disabled={!node.isActive}><FolderPlus /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(node)} aria-label={`Edit ${node.name}`}><Pencil /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete(node)} aria-label={`Delete ${node.name}`}><Trash2 className="text-destructive" /></Button>
        </div>
      </div>
      {has && expanded && (
        <ul>
          {node.children.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} forceOpen={forceOpen} onAdd={onAdd} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const tree = useCategoryTree(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [del, setDel] = useState<CategoryNode | null>(null);
  const [delError, setDelError] = useState<{ message: string; code?: string } | null>(null);

  const visible = useMemo(() => (tree.data ? (search.trim() ? filterTree(tree.data, search.trim()) : tree.data) : []), [tree.data, search]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['category-tree'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
    qc.invalidateQueries({ queryKey: ['catalogue'] });
  };

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = { name: f.name.trim(), description: f.description.trim(), parent: f.parent, isActive: f.isActive };
      return f.mode === 'create' ? categoryService.create(body) : categoryService.update(f.id!, body);
    },
    onSuccess: (_d, f) => { toast.success(f.mode === 'create' ? 'Category created' : 'Category updated'); setForm(null); refresh(); },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Could not save the category'),
  });

  const toggle = useMutation({
    mutationFn: (n: CategoryNode) => categoryService.update(n.id, { isActive: !n.isActive }),
    onSuccess: (c) => { toast.success(c.isActive ? 'Category activated' : 'Category deactivated (sub-categories too)'); refresh(); },
  });

  const remove = useMutation({
    mutationFn: (n: CategoryNode) => categoryService.remove(n.id),
    onSuccess: () => { toast.success('Category deleted'); setDel(null); refresh(); },
    onError: (e) => setDelError(e instanceof ApiError ? { message: e.message, code: e.code } : { message: 'Could not delete the category' }),
  });

  const openCreate = (parent: CategoryNode | null) => {
    setFormError(null);
    setForm({ mode: 'create', name: '', description: '', parent: parent?.id ?? null, isActive: true });
  };
  const openEdit = async (n: CategoryNode) => {
    setFormError(null);
    setForm({ mode: 'edit', id: n.id, name: n.name, description: n.description ?? '', parent: n.parent, isActive: n.isActive });
  };
  const submit = () => {
    if (!form) return;
    if (!form.name.trim()) return setFormError('Name is required');
    setFormError(null);
    save.mutate(form);
  };

  const hasBlockingError = delError && (delError.code === 'CATEGORY_HAS_CHILDREN' || delError.code === 'CATEGORY_HAS_PRODUCTS');

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organise products in a tree of any depth."
        actions={<Button onClick={() => openCreate(null)}><Plus /> Add root category</Button>}
      />
      <Card>
        <div className="border-b p-4">
          <Input placeholder="Search categories…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" aria-label="Search categories" />
        </div>
        {tree.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : tree.isError ? (
          <ErrorState message={tree.error.message} onRetry={() => tree.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title={search ? 'No categories match' : 'No categories yet'}
            description={search ? 'Try a different search term.' : 'Create a root category to get started.'}
            action={!search ? <Button onClick={() => openCreate(null)}><Plus /> Add root category</Button> : undefined}
          />
        ) : (
          <ul>
            {visible.map((n) => (
              <Row
                key={n.id}
                node={n}
                depth={0}
                forceOpen={!!search.trim()}
                onAdd={openCreate}
                onEdit={openEdit}
                onToggle={(x) => toggle.mutate(x)}
                onDelete={(x) => { setDelError(null); setDel(x); }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{form.mode === 'create' ? (form.parent ? 'Add sub-category' : 'Add root category') : 'Edit category'}</DialogTitle>
                <DialogDescription>
                  {form.mode === 'edit' ? 'Change the parent to move this category and everything below it.' : 'Names must be unique among siblings.'}
                </DialogDescription>
              </DialogHeader>
              {formError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
              <div className="grid gap-4">
                <Field label="Name" htmlFor="cat-name"><Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
                <Field label="Description" htmlFor="cat-desc"><Textarea id="cat-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <Field label="Parent category" htmlFor="cat-parent">
                  {tree.data && (
                    <CategorySelect
                      id="cat-parent"
                      tree={tree.data}
                      value={form.parent}
                      onChange={(p) => setForm({ ...form, parent: p })}
                      allowNone
                      noneLabel="None (root category)"
                      excludeId={form.id}
                    />
                  )}
                  {form.mode === 'edit' && form.parent && !findNode(tree.data ?? [], form.parent)?.isActive && (
                    <p className="text-xs text-destructive">The current parent is inactive.</p>
                  )}
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /> Active
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete “${del?.name ?? ''}”?`}
        description={
          <div className="space-y-2">
            <p>This permanently removes the category. Categories that still have sub-categories or products cannot be deleted.</p>
            {hasBlockingError && del?.isActive && (
              <Button variant="secondary" size="sm" onClick={() => { toggle.mutate(del); setDel(null); }}>
                Deactivate instead
              </Button>
            )}
          </div>
        }
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        error={delError?.message ?? null}
        onConfirm={() => del && remove.mutate(del)}
      />
    </div>
  );
}
