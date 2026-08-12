import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('text-xs uppercase tracking-wider text-muted-foreground', className)} {...props} />;
}
export function TR({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border', className)} {...props} />;
}
export function TH({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('whitespace-nowrap px-4 py-3 font-semibold', className)} {...props} />;
}
export function TD({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('whitespace-nowrap px-4 py-3', className)} {...props} />;
}
