'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

// true on the client after hydration, false during SSR/hydration (avoids a hydration mismatch
// because the stored theme is only known in the browser).
const subscribe = () => () => undefined;
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

/**
 * Light / Dark / System switch. Uses the app's single theme system (next-themes, `class` strategy,
 * tokens in globals.css). next-themes stores the choice in localStorage and sets the class before
 * first paint, so the page does not flash the wrong theme.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('inline-flex items-center rounded-lg border bg-background p-0.5', className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active && 'bg-primary text-primary-foreground hover:text-primary-foreground'
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
