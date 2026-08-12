'use client';
import { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { historyTransactions, type Transaction } from '@/lib/mock-data';
import { StatusBadge } from '@/components/StatusBadge';
import { AmountDisplay } from '@/components/AmountDisplay';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FILTERS = ['All', 'Sent', 'Received', 'Card', 'International'] as const;
type Filter = (typeof FILTERS)[number];

const matches = (tx: Transaction, f: Filter) =>
  f === 'All' ||
  (f === 'Sent' && tx.channel === 'sent') ||
  (f === 'Received' && tx.channel === 'received') ||
  (f === 'Card' && tx.channel === 'card') ||
  (f === 'International' && tx.channel === 'international');

export default function HistoryPage() {
  const [filter, setFilter] = useState<Filter>('All');
  const [detail, setDetail] = useState<Transaction | null>(null);
  const list = historyTransactions.filter((tx) => matches(tx, filter));

  return (
    <div className="px-5 pt-4">
      <h1 className="mb-4 font-heading text-2xl font-bold">Transaction History</h1>

      <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn('whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold', filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
          >
            {f}
          </button>
        ))}
      </div>

      <button className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
        <Calendar size={16} /> Jul 1 – Jul 23, 2026
      </button>

      <div className="space-y-2">
        {list.map((tx) => (
          <button key={tx.id} onClick={() => setDetail(tx)} className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left hover:border-primary">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold">{tx.operator}</div>
              <div>
                <p className="text-sm font-medium">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{tx.date}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {tx.status === 'failed' ? <span className="text-sm font-semibold text-destructive">Failed</span> : <AmountDisplay amount={tx.amount} currency={tx.currency} className="text-sm" />}
              <StatusBadge status={tx.status} />
            </div>
          </button>
        ))}
      </div>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetail(null)} />
          <div className="relative z-10 mx-auto w-full max-w-md rounded-t-3xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">Transaction detail</h2>
              <button onClick={() => setDetail(null)} className="rounded-full p-1 text-muted-foreground hover:bg-accent"><X size={20} /></button>
            </div>
            <div className="mb-4 flex items-center justify-center">
              {detail.status === 'failed' ? <span className="text-2xl font-black text-destructive">Failed</span> : <AmountDisplay amount={detail.amount} currency={detail.currency} className="text-3xl" />}
            </div>
            <div className="space-y-2 text-sm">
              <DRow label="Description" value={detail.description} />
              <DRow label="Reference" value={detail.reference} />
              <DRow label="Timestamp" value={detail.date} />
              <DRow label="Operator" value={detail.operator} />
              {detail.corridor && <DRow label="Corridor" value={detail.corridor} />}
              <DRow label="Fee" value={`${detail.fee} ${detail.currency}`} />
              <div className="flex items-center justify-between pt-1"><span className="text-muted-foreground">Status</span><StatusBadge status={detail.status} /></div>
            </div>
            <Button variant="outline" className="mt-5 w-full">Download receipt PDF</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium">{value}</span>
    </div>
  );
}
