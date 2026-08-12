'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Smartphone, Landmark, ShieldCheck } from 'lucide-react';
import { paymentSources } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TINT: Record<string, string> = {
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

export default function LinkAccountPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string>('mtn');

  return (
    <div className="px-5 pt-4">
      <header className="mb-4 flex items-center">
        <button onClick={() => router.push('/standard/profile')} className="mr-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:bg-accent">
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-heading text-xl font-bold">Preferred account</h1>
      </header>
      <p className="mb-6 text-sm text-muted-foreground">Choose which account funds your AlphaPay payments. You can change this anytime.</p>

      {/* Mobile money */}
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Smartphone size={14} /> Mobile Money
      </div>
      <div className="space-y-2">
        {paymentSources.operators.map((o) => (
          <Option key={o.id} id={o.id} selected={selected} onSelect={setSelected} initials={o.initials} tint={TINT[o.tint]} name={o.name} tag={o.tag} />
        ))}
      </div>

      {/* Banks */}
      <div className="mb-2 mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Landmark size={14} /> Bank of your choice
      </div>
      <div className="space-y-2">
        {paymentSources.banks.map((b) => (
          <Option key={b.id} id={b.id} selected={selected} onSelect={setSelected} initials={b.initials} tint="bg-primary/10 text-primary" name={b.name} tag={b.tag} />
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
        <ShieldCheck size={20} className="shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">AlphaPay never holds your money — it links securely to the account you choose and moves funds only when you approve.</p>
      </div>

      <Button className="mt-6 w-full" onClick={() => router.push('/standard/profile')}>Set as preferred</Button>
    </div>
  );
}

function Option({ id, selected, onSelect, initials, tint, name, tag }: {
  id: string; selected: string; onSelect: (id: string) => void; initials: string; tint: string; name: string; tag: string;
}) {
  const active = selected === id;
  return (
    <button
      onClick={() => onSelect(id)}
      className={cn('flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors', active ? 'border-primary' : 'border-border hover:border-muted-foreground')}
    >
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold', tint)}>{initials}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{tag}</p>
      </div>
      <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
        {active && <Check size={14} />}
      </span>
    </button>
  );
}
