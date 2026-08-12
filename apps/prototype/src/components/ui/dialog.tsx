'use client';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export function Dialog({ open, onClose, title, children, className }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-t-3xl border border-border bg-card p-6 sm:rounded-3xl squircle',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          {title ? <h2 className="font-heading text-lg font-bold">{title}</h2> : <span />}
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
