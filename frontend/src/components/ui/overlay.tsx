'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const overlayCls = 'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0';

/* ── Dialog + Sheet ── */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayCls} />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-background p-5 shadow-lg ring-1 ring-foreground/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-3 right-3 rounded-md p-1 opacity-70 hover:bg-muted hover:opacity-100" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayCls} />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto bg-background p-5 shadow-xl ring-1 ring-foreground/10 data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-3 right-3 rounded-md p-1 opacity-70 hover:bg-muted hover:opacity-100" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogHeader = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col gap-1.5', className)} {...p} />
);
export const DialogFooter = ({ className, ...p }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...p} />
);
export const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={cn('text-base font-semibold', className)} {...p} />
);
export const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...p} />
);

/* ── Alert dialog ── */
export const AlertDialog = AlertPrimitive.Root;
export function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertPrimitive.Content>) {
  return (
    <AlertPrimitive.Portal>
      <AlertPrimitive.Overlay className={overlayCls} />
      <AlertPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-background p-5 shadow-lg ring-1 ring-foreground/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      />
    </AlertPrimitive.Portal>
  );
}
export const AlertDialogTitle = ({ className, ...p }: React.ComponentProps<typeof AlertPrimitive.Title>) => (
  <AlertPrimitive.Title className={cn('text-base font-semibold', className)} {...p} />
);
export const AlertDialogDescription = ({ className, ...p }: React.ComponentProps<typeof AlertPrimitive.Description>) => (
  <AlertPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...p} />
);
export const AlertDialogCancel = ({ className, ...p }: React.ComponentProps<typeof AlertPrimitive.Cancel>) => (
  <AlertPrimitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...p} />
);
export const AlertDialogAction = ({ className, ...p }: React.ComponentProps<typeof AlertPrimitive.Action>) => (
  <AlertPrimitive.Action className={cn(buttonVariants(), className)} {...p} />
);

/* ── Select ── */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground dark:bg-input/30',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-[state=open]:animate-in data-[state=open]:fade-in-0',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-72 w-full min-w-[var(--radix-select-trigger-width)] overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-default items-center rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}
