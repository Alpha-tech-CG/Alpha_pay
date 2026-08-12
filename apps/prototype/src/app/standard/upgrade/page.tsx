'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Code2, Check, ArrowLeft, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Kind = 'merchant' | 'developer';
type AppState = 'none' | 'pending' | 'approved';

function useUpgradeState(kind: Kind): [AppState, (s: AppState) => void] {
  const key = `alphapay_upgrade_${kind}`;
  const [state, setState] = useState<AppState>('none');
  useEffect(() => {
    const v = (typeof window !== 'undefined' && localStorage.getItem(key)) as AppState | null;
    if (v) setState(v);
  }, [key]);
  const update = (s: AppState) => { setState(s); localStorage.setItem(key, s); };
  return [state, update];
}

const FEATURES: Record<Kind, string[]> = {
  merchant: ['QR code payments', 'Sales dashboard', 'Reports & exports', 'Multi-terminal'],
  developer: ['API keys', 'Sandbox mode', 'Webhooks', 'Logs & monitoring'],
};

export default function UpgradePage() {
  const router = useRouter();
  const [merchantState, setMerchant] = useUpgradeState('merchant');
  const [devState, setDev] = useUpgradeState('developer');
  const [form, setForm] = useState<Kind | null>(null);

  const submit = (kind: Kind) => {
    if (kind === 'merchant') setMerchant('pending');
    else setDev('pending');
    setForm(null);
  };

  const approve = (kind: Kind) => {
    if (kind === 'merchant') { setMerchant('approved'); router.push('/merchant/dashboard'); }
    else { setDev('approved'); router.push('/developer/overview'); }
  };

  if (form) {
    return (
      <div className="px-5 pt-4">
        <header className="mb-4 flex items-center">
          <button onClick={() => setForm(null)} className="mr-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"><ArrowLeft size={22} /></button>
          <h1 className="font-heading text-xl font-bold">{form === 'merchant' ? 'Merchant application' : 'Developer application'}</h1>
        </header>
        <div className="space-y-4">
          {form === 'merchant' ? (
            <>
              <div><Label>Business name</Label><Input placeholder="Boutique Alpha" /></div>
              <div><Label>Business type</Label><Input placeholder="Sole trader / SME / Corporation" /></div>
              <div><Label>Sector</Label><Input placeholder="Retail, restaurant, services…" /></div>
              <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card py-6 text-sm text-muted-foreground"><Upload size={18} /> Upload registration document</button>
            </>
          ) : (
            <>
              <div><Label>Project name</Label><Input placeholder="My integration" /></div>
              <div><Label>Contact email</Label><Input placeholder="dev@myapp.com" /></div>
              <div><Label>Description</Label><Input placeholder="What are you building?" /></div>
            </>
          )}
          <Button className="w-full" onClick={() => submit(form)}>Submit application</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-4">
      <h1 className="mb-1 font-heading text-2xl font-bold">Upgrade your account</h1>
      <p className="mb-6 text-sm text-muted-foreground">Unlock merchant tools or developer APIs.</p>

      <UpgradeCard
        kind="merchant" Icon={Store} title="Become a Merchant"
        subtitle="Accept payments at your business" features={FEATURES.merchant}
        state={merchantState} onApply={() => setForm('merchant')} onApprove={() => approve('merchant')}
      />
      <div className="h-4" />
      <UpgradeCard
        kind="developer" Icon={Code2} title="Become a Developer"
        subtitle="Integrate AlphaPay into your app" features={FEATURES.developer}
        state={devState} onApply={() => setForm('developer')} onApprove={() => approve('developer')}
      />
    </div>
  );
}

function UpgradeCard({ Icon, title, subtitle, features, state, onApply, onApprove }: {
  kind: Kind; Icon: typeof Store; title: string; subtitle: string; features: string[];
  state: AppState; onApply: () => void; onApprove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={24} /></div>
        <div>
          <h2 className="font-heading font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ul className="mb-4 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground"><Check size={15} className="text-success" /> {f}</li>
        ))}
      </ul>
      {state === 'none' && <Button className="w-full" onClick={onApply}>Request access</Button>}
      {state === 'pending' && (
        <div className="space-y-2">
          <div className="rounded-xl bg-warning/10 py-2.5 text-center text-sm font-semibold text-warning">⏳ Application pending</div>
          <Button variant="outline" size="sm" className="w-full" onClick={onApprove}>Simulate approval →</Button>
        </div>
      )}
      {state === 'approved' && (
        <div className="rounded-xl bg-success/10 py-2.5 text-center text-sm font-semibold text-success">✅ Approved — access granted</div>
      )}
    </div>
  );
}
