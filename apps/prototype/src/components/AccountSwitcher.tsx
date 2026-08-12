'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, User, Store, Code2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCOUNTS = [
  { key: 'standard', label: 'Standard', href: '/standard/home', Icon: User },
  { key: 'merchant', label: 'Merchant', href: '/merchant/dashboard', Icon: Store },
  { key: 'developer', label: 'Developer', href: '/developer/overview', Icon: Code2 },
] as const;

export function AccountSwitcher({ active }: { active: 'standard' | 'merchant' | 'developer' }) {
  const [open, setOpen] = useState(false);
  const current = ACCOUNTS.find((a) => a.key === active)!;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-accent squircle"
      >
        <current.Icon size={16} className="text-primary" />
        <span>{current.label}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-2xl squircle">
            <p className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">Switch account</p>
            {ACCOUNTS.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent',
                  a.key === active && 'bg-accent/50',
                )}
              >
                <a.Icon size={16} className="text-primary" />
                <span className="flex-1 font-medium">{a.label}</span>
                {a.key === active && <Check size={15} className="text-success" />}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
