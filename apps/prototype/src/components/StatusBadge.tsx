import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, XCircle, RotateCcw } from 'lucide-react';
import type { TxStatus } from '@/lib/mock-data';

const MAP: Record<TxStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  confirmed: { label: 'Confirmed', cls: 'bg-success/15 text-success', Icon: CheckCircle2 },
  pending: { label: 'Pending', cls: 'bg-warning/15 text-warning', Icon: Clock },
  failed: { label: 'Failed', cls: 'bg-destructive/15 text-destructive', Icon: XCircle },
  refunded: { label: 'Refunded', cls: 'bg-info/15 text-info', Icon: RotateCcw },
};

export function StatusBadge({ status }: { status: TxStatus }) {
  const { label, cls, Icon } = MAP[status];
  return (
    <Badge className={cls}>
      <Icon size={12} />
      {label}
    </Badge>
  );
}
