import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'secondary' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25',
  outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
  ghost: 'bg-transparent text-foreground hover:bg-accent',
  secondary: 'bg-accent text-accent-foreground hover:opacity-90',
  destructive: 'bg-destructive text-white hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-6 text-base',
  icon: 'h-10 w-10',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-heading font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none squircle',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
