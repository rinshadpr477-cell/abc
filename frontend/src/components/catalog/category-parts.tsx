'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/overlay';
import { categoryService } from '@/services';
import { cn } from '@/lib/utils';
import type { CategoryNode } from '@/types';

export function useCategoryTree(includeInactive = false) {
  return useQuery({
    queryKey: ['category-tree', includeInactive],
    queryFn: () => categoryService.tree(includeInactive),
  });
}

export interface FlatCategory {
  id: string;
  name: string;
  level: number;
  isActive: boolean;
}

/** Depth-first flatten (any depth). `excludeId` drops a node and its whole subtree. */
export function flattenTree(nodes: CategoryNode[], excludeId?: string, out: FlatCategory[] = []): FlatCategory[] {
  for (const n of nodes) {
    if (n.id === excludeId) continue;
    out.push({ id: n.id, name: n.name, level: n.level, isActive: n.isActive });
    flattenTree(n.children, excludeId, out);
  }
  return out;
}

export function findNode(nodes: CategoryNode[], id: string): CategoryNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

const NONE = '__none__';

/** Indented category dropdown that works at any depth. */
export function CategorySelect({
  tree, value, onChange, allowNone, noneLabel = 'None', placeholder = 'Select category', excludeId, onlyActive = true, id,
}: {
  tree: CategoryNode[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  excludeId?: string;
  onlyActive?: boolean;
  id?: string;
}) {
  const items = flattenTree(tree, excludeId).filter((c) => !onlyActive || c.isActive);
  return (
    <Select value={value ?? (allowNone ? NONE : '')} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {items.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span style={{ paddingLeft: Math.min(c.level, 8) * 12 }}>{c.level > 0 ? '↳ ' : ''}{c.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function containsId(node: CategoryNode, id?: string): boolean {
  if (!id) return false;
  return node.id === id || node.children.some((c) => containsId(c, id));
}

function NavNode({ node, selected, onSelect }: { node: CategoryNode; selected?: string; onSelect: (id: string) => void }) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(() => containsId(node, selected));
  return (
    <li>
      <div className={cn('flex items-center gap-1 rounded-md', selected === node.id && 'bg-accent font-medium')}>
        <button
          type="button"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((o) => !o)}
          className={cn('flex size-6 shrink-0 items-center justify-center text-muted-foreground', !hasChildren && 'invisible')}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <button type="button" onClick={() => onSelect(node.id)} className="flex-1 truncate py-1.5 pr-2 text-left text-sm hover:underline">
          {node.name}
        </button>
      </div>
      {hasChildren && open && (
        <ul className="ml-3 border-l pl-1">
          {node.children.map((c) => (
            <NavNode key={c.id} node={c} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Storefront category navigation: expandable tree. Selecting a parent includes its descendants (backend resolves that). */
export function CategoryNav({ tree, selected, onSelect }: { tree: CategoryNode[]; selected?: string; onSelect: (id?: string) => void }) {
  return (
    <nav aria-label="Categories">
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className={cn('mb-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:underline', !selected && 'bg-accent font-medium')}
      >
        All products
      </button>
      <ul>
        {tree.map((n) => (
          <NavNode key={n.id} node={n} selected={selected} onSelect={onSelect} />
        ))}
      </ul>
    </nav>
  );
}
