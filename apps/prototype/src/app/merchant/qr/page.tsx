'use client';
import { useState } from 'react';
import { Download, Printer, Share2, Smartphone } from 'lucide-react';
import { merchant } from '@/lib/mock-data';
import { QRCode } from '@/components/QRCode';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function MerchantQR() {
  const [mode, setMode] = useState<'static' | 'dynamic'>('static');
  const [amount, setAmount] = useState('');

  return (
    <div className="mx-auto flex max-w-md flex-col items-center">
      <h1 className="mb-1 font-heading text-2xl font-bold">My Payment QR Code</h1>
      <p className="mb-5 text-sm text-muted-foreground">Display this at your point of sale</p>

      <div className="mb-5 flex rounded-xl border border-border bg-card p-1">
        <button onClick={() => setMode('static')} className={cn('rounded-lg px-6 py-2 text-xs font-bold', mode === 'static' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Static QR</button>
        <button onClick={() => setMode('dynamic')} className={cn('rounded-lg px-6 py-2 text-xs font-bold', mode === 'dynamic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Dynamic QR</button>
      </div>

      {mode === 'dynamic' && (
        <div className="mb-5 w-full max-w-xs">
          <Label>Amount to encode (XAF)</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 5000" inputMode="numeric" />
        </div>
      )}

      <QRCode seed={`${merchant.id}-${mode}-${amount}`} size={260} />

      <div className="mt-5 text-center">
        <h2 className="font-heading font-bold">{merchant.business}</h2>
        <p className="text-sm text-muted-foreground">ID: {merchant.id}</p>
        {mode === 'dynamic' && amount && <p className="mt-1 font-mono text-lg font-bold text-primary">{parseInt(amount, 10).toLocaleString('fr-FR')} XAF</p>}
      </div>

      <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-3">
        <ActionBtn Icon={Download} label="Download PNG" />
        <ActionBtn Icon={Printer} label="Print" />
        <ActionBtn Icon={Share2} label="Share" />
      </div>

      <div className="mt-6 w-full rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-primary" />
          <h3 className="font-heading text-sm font-bold">For feature phone customers</h3>
        </div>
        <p className="mt-2 font-mono text-lg font-bold">{merchant.ussd}</p>
        <p className="mt-1 text-xs text-muted-foreground">Customers dial this USSD code to pay you.</p>
      </div>
    </div>
  );
}

function ActionBtn({ Icon, label }: { Icon: typeof Download; label: string }) {
  return (
    <button className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover:bg-accent">
      <Icon size={20} className="text-primary" />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
