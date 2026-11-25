'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/basic';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SheetContent } from '@/components/ui/overlay';
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, PaginationBar, TableSkeleton, useDebounced } from '@/components/common';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { userService } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types';

const ALL = 'all';

export default function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [detail, setDetail] = useState<User | null>(null);
  const [toggle, setToggle] = useState<User | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const debounced = useDebounced(search);

  const q = useQuery({
    queryKey: ['admin-users', { page, debounced, role, status }],
    queryFn: () =>
      userService.list({
        page, limit: 10, search: debounced,
        role: role === ALL ? undefined : role,
        isActive: status === ALL ? undefined : status === 'active',
      }),
    placeholderData: (p) => p,
  });

  const mutate = useMutation({
    mutationFn: (u: User) => userService.setStatus(u.id, !u.isActive),
    onSuccess: (updated) => {
      toast.success(updated.isActive ? 'User activated' : 'User deactivated');
      setToggle(null);
      setDetail((d) => (d && d.id === updated.id ? updated : d));
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not update the user'),
  });

  const canToggle = (u: User) => u.role === 'CUSTOMER' && u.id !== me?.id;
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      <PageHeader title="Users" description="Search and manage customer accounts." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Input placeholder="Search name or email" value={search} onChange={(e) => reset(() => setSearch(e.target.value))} className="max-w-xs" aria-label="Search users" />
          <Select value={role} onValueChange={(v) => reset(() => setRole(v))}>
            <SelectTrigger className="w-36" aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All roles</SelectItem><SelectItem value="CUSTOMER">Customer</SelectItem><SelectItem value="ADMIN">Admin</SelectItem></SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
            <SelectTrigger className="w-36" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
          </Select>
        </div>
        {q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        ) : !q.isLoading && q.data?.items.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users match" description="Try a different search or filter." />
        ) : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? <TableSkeleton columns={6} /> : q.data?.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell><Badge variant={u.role === 'ADMIN' ? 'purple' : 'secondary'}>{u.role}</Badge></TableCell>
                    <TableCell><Badge variant={u.isActive ? 'success' : 'destructive'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell>{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setDetail(u)}>Details</Button>
                      {canToggle(u) && (
                        <Button variant={u.isActive ? 'destructive' : 'secondary'} size="sm" onClick={() => { setErr(null); setToggle(u); }}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {q.data && <PaginationBar meta={q.data.meta} itemLabel="users" onPageChange={setPage} />}
          </>
        )}
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent>
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.name}</DialogTitle><DialogDescription>{detail.email}</DialogDescription></DialogHeader>
              <dl className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
                <dt className="text-muted-foreground">Role</dt><dd>{detail.role}</dd>
                <dt className="text-muted-foreground">Status</dt><dd>{detail.isActive ? 'Active' : 'Inactive'}</dd>
                <dt className="text-muted-foreground">Joined</dt><dd>{formatDate(detail.createdAt)}</dd>
                <dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs break-all">{detail.id}</dd>
              </dl>
              {canToggle(detail) && (
                <Button variant={detail.isActive ? 'destructive' : 'default'} onClick={() => { setErr(null); setToggle(detail); }}>
                  {detail.isActive ? 'Deactivate account' : 'Activate account'}
                </Button>
              )}
            </>
          )}
        </SheetContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggle}
        onOpenChange={(o) => !o && setToggle(null)}
        title={toggle?.isActive ? 'Deactivate this user?' : 'Activate this user?'}
        description={toggle?.isActive ? `${toggle?.name} will be signed out and unable to log in until reactivated.` : `${toggle?.name} will be able to sign in again.`}
        confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'}
        destructive={!!toggle?.isActive}
        busy={mutate.isPending}
        error={err}
        onConfirm={() => toggle && mutate.mutate(toggle)}
      />
    </div>
  );
}
