import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-input px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary squircle',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
