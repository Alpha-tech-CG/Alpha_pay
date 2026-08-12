'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Delete, ChevronDown, Phone, Globe, QrCode, CheckCircle2, Share2,
} from 'lucide-react';
import { recentContacts, countries, currencies } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Step = 'recipient' | 'amount' | 'confirm' | 'success';
type Method = 'phone' | 'international' | 'scan';

const RATE = 0.00055; // 1 XAF -> LYD (mock)

export default function SendMoney() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('recipient');
  const [method, setMethod] = useState<Method>('phone');
  const [country, setCountry] = useState(countries[0]);
  const [recipient, setRecipient] = useState(recentContacts[0]);
  const [amount, setAmount] = useState('50000');
  const [currency, setCurrency] = useState<(typeof currencies)[number]>('XAF');
  const [pin, setPin] = useState('');

  const numeric = parseInt(amount || '0', 10);
  const fee = 500;
  const total = numeric + fee;
  const receives = (numeric * RATE).toFixed(2);

  const press = (k: string) => {
    if (k === 'del') setAmount((a) => a.slice(0, -1));
    else if (k === '.') setAmount((a) => (a.includes('.') ? a : a + '.'));
    else setAmount((a) => (a === '0' ? k : a + k));
  };

  /* ── STEP: recipient ── */
  if (step === 'recipient') {
    return (
      <div className="px-5 pt-2">
        <Header title="Send Money" onBack={() => router.push('/standard/home')} />
        {/* method toggle */}
        <div className="mb-5 mt-2 flex gap-2 rounded-xl border border-border bg-card p-1">
          {[
            { k: 'phone', label: 'Phone', Icon: Phone },
            { k: 'international', label: 'International', Icon: Globe },
            { k: 'scan', label: 'Scan QR', Icon: QrCode },
          ].map((m) => (
            <button
              key={m.k}
              onClick={() => setMethod(m.k as Method)}
              className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold', method === m.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              <m.Icon size={14} />
              {m.label}
            </button>
          ))}
        </div>

        {method === 'scan' ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card text-muted-foreground">
            <QrCode size={48} />
            <p className="text-sm">Point the camera at a payment QR</p>
          </div>
        ) : (
          <>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone number</label>
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-input px-3">
              <button className="flex items-center gap-1 border-r border-border py-3 pr-3 text-sm">
                {country.flag} {country.dial} <ChevronDown size={14} className="text-muted-foreground" />
              </button>
              <input placeholder="06 123 4567" className="h-12 flex-1 bg-transparent text-sm outline-none" />
            </div>
            {method === 'international' && (
              <div className="mb-5 flex flex-wrap gap-2">
                {countries.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setCountry(c)}
                    className={cn('rounded-full border px-3 py-1.5 text-xs', country.code === c.code ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
                  >
                    {c.flag} {c.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent contacts</p>
        <div className="space-y-2">
          {recentContacts.map((ct) => (
            <button
              key={ct.phone}
              onClick={() => { setRecipient(ct); setStep('amount'); }}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:border-primary"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{ct.initials}</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{ct.name} {ct.country}</p>
                <p className="text-xs text-muted-foreground">{ct.phone}</p>
              </div>
              <ArrowRight size={18} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── STEP: amount (faithful to send-money.html) ── */
  if (step === 'amount') {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] flex-col px-5 pt-2">
        <Header title="Send Money" onBack={() => setStep('recipient')} />
        <label className="mb-2 mt-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipient</label>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">{recipient.initials}</div>
          <div className="flex-1">
            <h3 className="font-heading text-sm font-semibold">{recipient.name}</h3>
            <p className="text-xs text-muted-foreground">{recipient.phone}</p>
          </div>
          <button onClick={() => setStep('recipient')} className="text-xs font-semibold text-primary hover:underline">Change</button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">You send</span>
            <div className="relative">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof currency)}
                className="appearance-none rounded-md border border-border bg-accent px-2 py-0.5 text-xs font-bold outline-none"
              >
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4 font-heading text-6xl font-bold tracking-tighter">{numeric.toLocaleString('fr-FR')}</div>
          <div className="space-y-1 text-center">
            <p className="text-sm text-muted-foreground">Recipient receives ≈ <span className="font-semibold text-foreground">{receives} LYD</span></p>
            <p className="text-xs italic text-muted-foreground">1 XAF = 0.00055 LYD</p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card/50 p-4">
          <Row label="Transfer Fee" value={`${fee} XAF`} />
          <Row label="Exchange Rate" value="Mid-market" />
          <div className="flex justify-between border-t border-border pt-2 font-bold">
            <span>Total to pay</span>
            <span className="text-primary">{total.toLocaleString('fr-FR')} XAF</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-8 gap-y-2 px-4 py-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
            <button key={k} onClick={() => press(k)} className="flex items-center justify-center rounded-xl py-3 font-heading text-2xl font-semibold hover:bg-accent">
              {k === 'del' ? <Delete size={24} /> : k}
            </button>
          ))}
        </div>

        <Button size="lg" className="mb-6 w-full" onClick={() => setStep('confirm')}>
          Continue to Pay <ArrowRight size={20} />
        </Button>
      </div>
    );
  }

  /* ── STEP: confirm (PIN) ── */
  if (step === 'confirm') {
    return (
      <div className="px-5 pt-2">
        <Header title="Confirm & Pay" onBack={() => setStep('amount')} />
        <div className="mt-2 space-y-2 rounded-2xl border border-border bg-card p-5">
          <Row label="From" value="My AlphaPay balance" />
          <Row label="To" value={recipient.name} />
          <Row label="Amount" value={`${numeric.toLocaleString('fr-FR')} XAF`} />
          <Row label="Fee" value={`${fee} XAF`} />
          <Row label="Corridor" value="Congo → Libya via USDC • ~5 min" />
          <div className="flex justify-between border-t border-border pt-2 font-bold">
            <span>Total</span><span className="text-primary">{total.toLocaleString('fr-FR')} XAF</span>
          </div>
        </div>

        <p className="mb-3 mt-6 text-center text-sm text-muted-foreground">Enter your 6-digit PIN</p>
        <div className="mb-6 flex justify-center gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={cn('h-4 w-4 rounded-full', i < pin.length ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <div className="mx-auto grid max-w-xs grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
            <button
              key={i}
              onClick={() => { if (k === 'del') setPin((p) => p.slice(0, -1)); else if (k) setPin((p) => (p.length < 6 ? p + k : p)); }}
              disabled={!k}
              className={cn('rounded-xl py-4 text-2xl font-semibold', k ? 'hover:bg-accent' : 'opacity-0')}
            >
              {k === 'del' ? <Delete size={22} className="mx-auto" /> : k}
            </button>
          ))}
        </div>
        <Button size="lg" className="mb-6 mt-6 w-full" disabled={pin.length !== 6} onClick={() => setStep('success')}>
          Send {total.toLocaleString('fr-FR')} XAF
        </Button>
      </div>
    );
  }

  /* ── STEP: success ── */
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-5 text-center">
      <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-success/15">
        <CheckCircle2 size={56} className="text-success" />
      </div>
      <h1 className="font-heading text-2xl font-black">Transfer sent</h1>
      <p className="mt-2 text-sm text-muted-foreground">{numeric.toLocaleString('fr-FR')} XAF to {recipient.name}</p>

      <div className="mt-6 w-full space-y-2 rounded-2xl border border-border bg-card p-5 text-left">
        <Row label="Recipient receives" value={`${receives} LYD`} />
        <Row label="Fee" value={`${fee} XAF`} />
        <Row label="Corridor" value="Congo → Libya • ~5 min" />
        <Row label="Reference" value="ALP-INTL-4411" />
      </div>
      <Button variant="outline" className="mt-4 w-full"><Share2 size={18} /> Share receipt</Button>
      <Button className="mt-3 w-full" onClick={() => router.push('/standard/home')}>Done</Button>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex items-center pt-4">
      <button onClick={onBack} className="mr-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:bg-accent">
        <ArrowLeft size={22} />
      </button>
      <h1 className="flex-1 font-heading text-xl font-bold">{title}</h1>
    </header>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
