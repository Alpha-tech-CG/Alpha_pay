'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const ENDPOINTS = ['/v1/payments/request', '/v1/payments/:id', '/v1/settlements', '/v1/cards/issue', '/v1/balance', '/v1/webhooks'];

export default function DevConsole() {
  const [method, setMethod] = useState('POST');
  const [endpoint, setEndpoint] = useState(ENDPOINTS[0]);
  const [body, setBody] = useState('{\n  "amount": 5000,\n  "currency": "XAF",\n  "phone": "+242060000000"\n}');
  const [resp, setResp] = useState<{ status: number; latency: number; json: string } | null>(null);
  const [history, setHistory] = useState<{ method: string; endpoint: string; status: number }[]>([]);

  const send = () => {
    const status = 202;
    const latency = 180 + Math.floor(Math.random() * 200);
    setResp({ status, latency, json: JSON.stringify({ status: 'ACCEPTED', referenceId: 'a1b2c3d4-e5f6', method, endpoint }, null, 2) });
    setHistory((h) => [{ method, endpoint, status }, ...h].slice(0, 20));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="font-heading text-2xl font-bold">API Console</h1>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-3">
          <Card className="space-y-3 p-5">
            <div className="flex gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm font-bold outline-none">
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="flex-1 rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-sm outline-none">
                {ENDPOINTS.map((e) => <option key={e}>{e}</option>)}
              </select>
              <Button onClick={send}><Send size={16} /> Send</Button>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Authorization</p>
              <div className="rounded-xl border border-border bg-input px-3 py-2 font-mono text-xs text-muted-foreground">Bearer alp_sk_test_9c10•••• (sandbox — auto-filled)</div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Headers</p>
              <div className="rounded-xl border border-border bg-input px-3 py-2 font-mono text-xs">Content-Type: application/json</div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="w-full rounded-xl border border-border bg-[#0c0c16] p-3 font-mono text-xs text-info outline-none" />
            </div>
          </Card>

          {resp && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="rounded-lg bg-success/15 px-2.5 py-1 text-xs font-bold text-success">{resp.status} Accepted</span>
                <span className="text-xs text-muted-foreground">{resp.latency}ms</span>
              </div>
              <pre className="overflow-auto rounded-xl bg-[#0c0c16] p-4 font-mono text-xs text-success">{resp.json}</pre>
            </Card>
          )}
        </div>

        {/* history */}
        <Card className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</p>
          <div className="space-y-1.5">
            {history.length === 0 && <p className="text-xs text-muted-foreground">No calls yet.</p>}
            {history.map((h, i) => (
              <button key={i} onClick={() => { setMethod(h.method); setEndpoint(h.endpoint); }} className="flex w-full items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left font-mono text-[11px] hover:bg-accent">
                <span className={cn('font-bold', h.method === 'GET' ? 'text-info' : 'text-success')}>{h.method}</span>
                <span className="flex-1 truncate">{h.endpoint}</span>
                <span className="text-success">{h.status}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
