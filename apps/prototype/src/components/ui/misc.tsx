'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/* Separator */
export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <div
      className={cn(vertical ? 'w-px self-stretch' : 'h-px w-full', 'bg-border', className)}
    />
  );
}

/* Progress */
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* Switch */
export function Switch({ defaultOn = false, onChange }: { defaultOn?: boolean; onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      onClick={() => { const v = !on; setOn(v); onChange?.(v); }}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-muted')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

/* Tabs (controlled, simple) */
export function Tabs({ tabs, value, onValueChange, className }: {
  tabs: { value: string; label: string }[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-xl border border-border bg-card p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onValueChange(t.value)}
          className={cn(
            'rounded-lg px-4 py-1.5 text-xs font-bold transition-colors',
            value === t.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
