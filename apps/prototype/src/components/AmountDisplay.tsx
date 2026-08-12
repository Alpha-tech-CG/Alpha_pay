import { cn } from '@/lib/utils';

/** Signed amount with currency code, colored by direction. Never a bare number. */
export function AmountDisplay({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  const positive = amount > 0;
  const negative = amount < 0;
  const sign = positive ? '+' : negative ? '-' : '';
  const abs = Math.abs(amount).toLocaleString('fr-FR', { minimumFractionDigits: currency === 'XAF' ? 0 : 2 });
  return (
    <span
      className={cn(
        'font-mono font-semibold tabular-nums',
        positive && 'text-success',
        negative && 'text-foreground',
        !positive && !negative && 'text-muted-foreground',
        className,
      )}
    >
      {sign}
      {abs} {currency}
    </span>
  );
}
