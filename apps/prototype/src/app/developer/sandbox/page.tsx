'use client';
import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const OPERATORS = ['MTN MoMo', 'Airtel Money', 'Libyan Bank'];
const SCENARIOS = [
  { key: 'success', label: '✅ Success' },
  { key: 'insufficient', label: '💸 Insufficient funds' },
  { key: 'timeout', label: '⏱️ Timeout' },
  { key: 'fraud', label: '🚫 Fraud flag' },
];

export default function DevSandbox() {
  const [operator, setOperator] = useState(OPERATORS[0]);
  const [phone, setPhone] = useState('+242060000000');
  const [amount, setAmount] = useState('5000');
  const [currency, setCurrency] = useState('XAF');
  const [scenario, setScenario] = useState('success');
  const [response, setResponse] = useState<string | null>(null);

  const request = JSON.stringify({ operator, phone, amount: Number(amount), currency, scenario }, null, 2);

  const send = () => {
    const now = '2026-07-23T14:32:11Z';
    const map: Record<string, object> = {
      success: { status: 'SUCCESSFUL', referenceId: 'a1b2c3d4-e5f6-7890', amount: Number(amount), currency, timestamp: now },
      insufficient: { status: 'FAILED', error: 'INSUFFICIENT_FUNDS', message: 'Payer balance too low', timestamp: now },
      timeout: { status: 'PENDING', error: 'TIMEOUT', message: 'No response from operator', timestamp: now },
      fraud: { status: 'REJECTED', error: 'FRAUD_FLAG', message: 'Transaction blocked by risk engine', timestamp: now },
    };
    setResponse(JSON.stringify(map[scenario], null, 2));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Payment Simulator</h1>
        <Button variant="outline" size="sm"><RotateCcw size={16} /> Reset sandbox wallets</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* form */}
        <Card className="space-y-4 p-5">
          <div>
            <Label>Operator</Label>
            <select value={operator} onChange={(e) => setOperator(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm outline-none">
              {OPERATORS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div><Label>Phone number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="flex gap-2">
            <div className="flex-1"><Label>Amount</Label><Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></div>
            <div className="w-28"><Label>Currency</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-input px-2 text-sm outline-none">
                {['XAF', 'LYD', 'USDC', 'EUR'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Scenario</Label>
            <div className="grid grid-cols-2 gap-2">
              {SCENARIOS.map((s) => (
                <button key={s.key} onClick={() => setScenario(s.key)} className={cn('rounded-xl border px-3 py-2 text-xs font-semibold', scenario === s.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{s.label}</button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={send}><Play size={16} /> Send Test Request</Button>
        </Card>

        {/* request / response */}
        <Card className="p-5 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request</p>
              <pre className="h-72 overflow-auto rounded-xl bg-[#0c0c16] p-4 font-mono text-xs text-info">{request}</pre>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response</p>
              <pre className="h-72 overflow-auto rounded-xl bg-[#0c0c16] p-4 font-mono text-xs text-success">{response ?? '// Send a request to see the response'}</pre>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
