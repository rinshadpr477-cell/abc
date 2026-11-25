'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/basic';
import { Field } from '@/components/common';
import { AuthShell } from '@/components/auth/auth-shell';
import { ApiError } from '@/lib/api';
import { authService } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import { sessionNotice } from '@/lib/session-notice';

const email = z.string().trim().email('Enter a valid email address');
const password = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a digit');

const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });
const registerSchema = z
  .object({ name: z.string().trim().min(2, 'At least 2 characters').max(80), email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-9" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-2 text-muted-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  // Arriving from an ended session (`?reason=expired|deactivated`): say why. Unknown values are ignored.
  useEffect(() => {
    const message = sessionNotice(new URLSearchParams(window.location.search).get('reason'));
    if (message) toast.info(message, { id: 'session-notice', duration: 8000 });
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { accessToken, user } = await authService.login(values);
      toast.success(`Welcome back, ${user.name}!`);
      setSession(accessToken, user); // RedirectIfAuthed then navigates to ?next or the role's home
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Unable to sign in');
    }
  });

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to ABC Ecommerce"
      footer={<>New here? <Link href="/register" className="font-medium text-foreground underline">Create an account</Link></>}
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {formError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterForm() {
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, email: mail, password: pw }) => {
    setFormError(null);
    try {
      const { accessToken, user } = await authService.register({ name, email: mail, password: pw });
      toast.success('Account created');
      setSession(accessToken, user);
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) {
        e.errors.forEach((er) => {
          if (er.field === 'email' || er.field === 'name' || er.field === 'password') form.setError(er.field, { message: er.message });
        });
      }
      setFormError(e instanceof ApiError ? e.message : 'Unable to register');
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register as a customer to start shopping"
      footer={<>Already registered? <Link href="/login" className="font-medium text-foreground underline">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {formError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message} hint="8+ characters with upper, lower case and a digit">
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
    </AuthShell>
  );
}
