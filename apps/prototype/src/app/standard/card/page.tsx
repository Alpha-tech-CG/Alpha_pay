'use client';
import { useState } from 'react';
import { Eye, EyeOff, Plus, Snowflake, Settings, Trash2 } from 'lucide-react';
import { virtualCard, cardTransactions } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { AmountDisplay } from '@/components/AmountDisplay';

const ACTIONS = [
  { label: 'Top Up', Icon: Plus },
  { label: 'Freeze', Icon: Snowflake },
  { label: 'Settings', Icon: Settings },
  { label: 'Delete', Icon: Trash2 },
];

export default function CardPage() {
  const [revealed, setRevealed] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [amount, setAmount] = useState('10000');

  const xaf = parseInt(amount || '0', 10);
  const usd = (xaf / 617).toFixed(2);

  return (
    <div className="px-5 pt-4">
      <h1 className="mb-5 font-heading text-2xl font-bold">Virtual Card</h1>

      {/* Card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#23233f] to-[#12121f] p-6 shadow-2xl">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <span className="font-heading text-lg font-black">AlphaPay</span>
          {frozen && <span className="rounded-full bg-info/20 px-2 py-0.5 text-[10px] font-bold text-info">FROZEN</span>}
        </div>
        <div className="relative mt-8 font-mono text-xl tracking-widest">
          {revealed ? virtualCard.pan : `•••• •••• •••• ${virtualCard.last4}`}
        </div>
        <div className="relative mt-6 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/50">Card holder</p>
            <p className="text-sm font-semibold">{virtualCard.holder}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/50">Expiry</p>
            <p className="text-sm font-semibold">{virtualCard.expiry}</p>
          </div>
          <span className="font-heading text-xl font-black italic text-white/90">VISA</span>
        </div>
        {revealed && (
          <p className="relative mt-3 font-mono text-xs text-white/70">CVV {virtualCard.cvv}</p>
        )}
      </div>

      <button onClick={() => setRevealed((r) => !r)} className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
        {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
        {revealed ? 'Hide card details' : 'Reveal card'}
      </button>

      {/* Balance */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">Card balance</p>
        <p className="font-heading text-3xl font-black">${virtualCard.balanceUSD.toFixed(2)} <span className="text-lg text-muted-foreground">USD</span></p>
      </div>

      {/* Actions */}
      <div className="mt-5 grid grid-cols-4 gap-3">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => { if (a.label === 'Top Up') setTopUp(true); if (a.label === 'Freeze') setFrozen((f) => !f); }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card py-3 hover:bg-accent"
          >
            <a.Icon size={20} className={a.label === 'Delete' ? 'text-destructive' : 'text-primary'} />
            <span className="text-xs font-medium">{a.label === 'Freeze' && frozen ? 'Unfreeze' : a.label}</span>
          </button>
        ))}
      </div>

      {/* Card transactions */}
      <h2 className="mb-3 mt-6 font-heading text-base font-bold">Card transactions</h2>
      <div className="space-y-2">
        {cardTransactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium">{tx.description}</p>
              <p className="text-xs text-muted-foreground">{tx.date}</p>
            </div>
            <div className="flex items-center gap-3">
              <AmountDisplay amount={tx.amount} currency={tx.currency} className="text-sm" />
              <StatusBadge status={tx.status} />
            </div>
          </div>
        ))}
      </div>

      {/* Top Up modal */}
      <Dialog open={topUp} onClose={() => setTopUp(false)} title="Top up card">
        <div className="space-y-4">
          <div>
            <Label>Amount (XAF)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </div>
          <div className="rounded-xl border border-border bg-input p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="font-medium">From MTN MoMo wallet</span></div>
            <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Conversion</span><span className="font-medium">{xaf.toLocaleString('fr-FR')} XAF → ${usd} USD</span></div>
            <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-medium">617 XAF/$</span></div>
            <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium">$0.50</span></div>
          </div>
          <Button className="w-full" onClick={() => setTopUp(false)}>Confirm top-up</Button>
        </div>
      </Dialog>
    </div>
  );
}
