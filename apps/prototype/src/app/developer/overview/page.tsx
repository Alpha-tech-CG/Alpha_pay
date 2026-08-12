'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { developer, apiCalls } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const CURL = `curl -X POST https://api.alphapay.co/v1/payments/request \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"amount": 5000, "currency": "XAF", "phone": "+242060000000"}'`;

export default function DevOverview() {
  const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Env banner */}
      <div className={cn('flex items-center justify-between rounded-2xl border p-4', env === 'sandbox' ? 'border-warning/30 bg-warning/10' : 'border-success/30 bg-success/10')}>
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', env === 'sandbox' ? 'bg-warning' : 'bg-success')} />
          <span className={cn('font-heading text-sm font-bold', env === 'sandbox' ? 'text-warning' : 'text-success')}>
            {env === 'sandbox' ? 'SANDBOX MODE' : 'PRODUCTION MODE'}
          </span>
        </div>
        <button onClick={() => setEnv((e) => (e === 'sandbox' ? 'production' : 'sandbox'))} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent">
          Switch to {env === 'sandbox' ? 'Production' : 'Sandbox'}
        </button>
      </div>

      <h1 className="font-heading text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="API calls today" value={String(developer.callsToday)} />
        <Stat label="Calls this month" value={`${developer.callsMonth.toLocaleString('fr-FR')} / ${developer.callsQuota.toLocaleString('fr-FR')}`} />
        <Stat label="Error rate" value={`${developer.errorRatePct}%`} />
        <Stat label="Last call" value={developer.lastCall} />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Recent API calls</h2>
        <div className="space-y-1.5 font-mono text-xs">
          {apiCalls.map((c, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
              <span className={cn('w-12 font-bold', c.method === 'GET' ? 'text-info' : c.method === 'POST' ? 'text-success' : 'text-warning')}>{c.method}</span>
              <span className="flex-1 truncate text-foreground">{c.endpoint}</span>
              <span className={cn('font-bold', c.ok ? 'text-success' : 'text-destructive')}>{c.status}</span>
              <span className="w-14 text-right text-muted-foreground">{c.latency}ms</span>
              <span>{c.ok ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading font-bold">Make your first API call</h2>
          <button onClick={() => { navigator.clipboard?.writeText(CURL); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent">
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-[#0c0c16] p-4 font-mono text-xs leading-relaxed text-foreground/90">{CURL}</pre>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-heading text-lg font-black">{value}</p></Card>;
}
