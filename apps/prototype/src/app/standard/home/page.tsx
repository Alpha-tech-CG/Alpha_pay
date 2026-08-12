'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Eye, EyeOff, ArrowUpRight, ArrowDownLeft, QrCode, Plus, Bell,
  CheckCircle2, Clock, XCircle, Globe, ChevronRight,
} from 'lucide-react';
import { standardUser, recentTransactions, type Transaction } from '@/lib/mock-data';
import { AmountDisplay } from '@/components/AmountDisplay';
import { cn } from '@/lib/utils';

const QUICK = [
  { label: 'Send', href: '/standard/send', Icon: ArrowUpRight, filled: true },
  { label: 'Receive', href: '/standard/receive', Icon: ArrowDownLeft, filled: false },
  { label: 'Pay QR', href: '/standard/send', Icon: QrCode, filled: false },
  { label: 'Top Up', href: '/standard/card', Icon: Plus, filled: false },
];

function TxIcon({ tx }: { tx: Transaction }) {
  const incoming = tx.amount > 0;
  const failed = tx.status === 'failed';
  const Icon = tx.status === 'pending' ? Clock : failed ? XCircle : incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        failed ? 'bg-destructive/15 text-destructive'
          : tx.status === 'pending' ? 'bg-warning/15 text-warning'
          : incoming ? 'bg-success/15 text-success' : 'bg-accent text-foreground',
      )}
    >
      <Icon size={18} />
    </div>
  );
}

export default function StandardHome() {
  const [hidden, setHidden] = useState(false);
  return (
    <div className="px-5">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link href="/standard/profile" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
            {standardUser.initials}
          </Link>
          <div>
            <p className="text-xs text-muted-foreground">Standard account</p>
            <h1 className="font-heading text-lg font-bold">Bonjour, {standardUser.name.split(' ')[0]} 👋</h1>
          </div>
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground">
          <Bell size={18} />
        </button>
      </div>

      {/* Balance card */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border bg-card p-6 text-center squircle">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10" />
        <div className="mb-1 flex items-center justify-center gap-2">
          <span className="text-sm text-muted-foreground">Total balance</span>
          <button onClick={() => setHidden((h) => !h)} className="text-muted-foreground">
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-heading text-5xl font-black tracking-tighter">
            {hidden ? '••• •••' : standardUser.balance.toLocaleString('fr-FR')}
          </span>
          <span className="text-lg font-semibold text-muted-foreground">{standardUser.currency}</span>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
          <CheckCircle2 size={13} className="text-success" />
          <span className="text-xs text-muted-foreground">Linked: {standardUser.linked} • {standardUser.phone}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6 flex justify-between">
        {QUICK.map((q) => (
          <Link key={q.label} href={q.href} className="flex flex-1 flex-col items-center gap-2">
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-full', q.filled ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
              <q.Icon size={22} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{q.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent transactions */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Recent transactions</h2>
        <Link href="/standard/history" className="text-xs font-semibold text-primary">See all</Link>
      </div>
      <div className="space-y-2">
        {recentTransactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 squircle">
            <div className="flex flex-1 items-center gap-3">
              <TxIcon tx={tx} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{tx.operator} • {tx.date}</p>
              </div>
            </div>
            {tx.status === 'failed' ? (
              <span className="text-xs font-semibold text-destructive">Failed</span>
            ) : (
              <AmountDisplay amount={tx.amount} currency={tx.currency} className="text-sm" />
            )}
          </div>
        ))}
      </div>

      {/* Libya banner */}
      <Link href="/standard/send" className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 squircle">
        <Globe size={22} className="shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-semibold">🌍 Send to Libya</p>
          <p className="text-xs text-muted-foreground">3–8 min via AlphaPay</p>
        </div>
        <ChevronRight size={20} className="text-muted-foreground" />
      </Link>
    </div>
  );
}
