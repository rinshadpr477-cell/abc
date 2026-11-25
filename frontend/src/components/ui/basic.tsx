'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30',
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm leading-none font-medium select-none peer-disabled:opacity-50', className)}
      {...props}
    />
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer size-4 shrink-0 rounded border border-input outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive/10 text-destructive',
        outline: 'border-border text-foreground',
        success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        warning: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        info: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
        purple: 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-xl bg-card text-card-foreground text-sm ring-1 ring-foreground/10', className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-base leading-snug font-medium', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export const TableHeader = (p: React.ComponentProps<'thead'>) => <thead {...p} className={cn('[&_tr]:border-b', p.className)} />;
export const TableBody = (p: React.ComponentProps<'tbody'>) => <tbody {...p} className={cn('[&_tr:last-child]:border-0', p.className)} />;
export const TableRow = (p: React.ComponentProps<'tr'>) => (
  <tr {...p} className={cn('border-b transition-colors hover:bg-muted/50', p.className)} />
);
export const TableHead = (p: React.ComponentProps<'th'>) => (
  <th {...p} className={cn('h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground', p.className)} />
);
export const TableCell = (p: React.ComponentProps<'td'>) => (
  <td {...p} className={cn('p-3 align-middle', p.className)} />
);
