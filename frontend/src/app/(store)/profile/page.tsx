'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui/basic';
import { Field, PageHeader } from '@/components/common';
import { RequireRole } from '@/components/auth/guards';
import { ApiError } from '@/lib/api';
import { authService } from '@/services';
import { useAuthStore } from '@/stores/auth.store';

const profileSchema = z.object({ name: z.string().trim().min(2, 'At least 2 characters').max(80), email: z.string().trim().email('Enter a valid email') });
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/\d/, 'Add a digit'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

function ProfileForm() {
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name, email: user.email } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (v) => {
    try {
      setUser(await authService.updateProfile(v));
      toast.success('Profile updated');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) form.setError('email', { message: e.message });
    }
  });
  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-md gap-4" noValidate>
          <Field label="Name" htmlFor="name" error={errors.name?.message}><Input id="name" {...form.register('name')} /></Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" {...form.register('email')} /></Field>
          <Button type="submit" disabled={isSubmitting} className="w-fit">{isSubmitting && <Loader2 className="animate-spin" />} Save changes</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const { accessToken, user } = await authService.changePassword({ currentPassword, newPassword });
      setSession(accessToken, user); // other devices are signed out; this one gets fresh tokens
      toast.success('Password changed');
      form.reset();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WRONG_PASSWORD') form.setError('currentPassword', { message: e.message });
    }
  });
  return (
    <Card>
      <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-md gap-4" noValidate>
          <Field label="Current password" htmlFor="cp" error={errors.currentPassword?.message}><Input id="cp" type="password" autoComplete="current-password" {...form.register('currentPassword')} /></Field>
          <Field label="New password" htmlFor="np" error={errors.newPassword?.message}><Input id="np" type="password" autoComplete="new-password" {...form.register('newPassword')} /></Field>
          <Field label="Confirm new password" htmlFor="cn" error={errors.confirm?.message}><Input id="cn" type="password" autoComplete="new-password" {...form.register('confirm')} /></Field>
          <Button type="submit" disabled={isSubmitting} className="w-fit">{isSubmitting && <Loader2 className="animate-spin" />} Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  return (
    <RequireRole role="CUSTOMER">
      <PageHeader title="My account" description="Manage your details and password." />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileForm />
        <PasswordForm />
      </div>
    </RequireRole>
  );
}
