'use client';
import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { apiLogs } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, THead, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Log = (typeof apiLogs)[number];
const STATUS_FILTERS = ['All', '2xx', '4xx', '5xx'] as const;

function bucket(code: number) { return code < 300 ? '2xx' : code < 500 ? '4xx' : '5xx'; }
function color(code: number) { return code < 300 ? 'text-success' : code < 500 ? 'text-warning' : 'text-destructive'; }

export default function DevLogs() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('All');
  const [env, setEnv] = useState('All');
  const [detail, setDetail] = useState<Log | null>(null);

  const rows = apiLogs.filter((l) => (status === 'All' || bucket(l.status) === status) && (env === 'All' || l.env === env));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Logs</h1>
        <Button variant="outline" size="sm"><Download size={16} /> Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none">
            {STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Environment</span>
          <select value={env} onChange={(e) => setEnv(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none">
            {['All', 'Sandbox', 'Production'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <Card className="p-0">
        <Table>
          <THead><TR><TH>Timestamp</TH><TH>Method</TH><TH>Endpoint</TH><TH>Status</TH><TH>Latency</TH><TH>Request ID</TH></TR></THead>
          <tbody>
            {rows.map((l) => (
              <TR key={l.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setDetail(l)}>
                <TD className="font-mono text-xs text-muted-foreground">{l.timestamp}</TD>
                <TD className="font-mono text-xs font-bold">{l.method}</TD>
                <TD className="font-mono text-xs">{l.endpoint}</TD>
                <TD><span className={cn('font-mono text-xs font-bold', color(l.status))}>{l.status}</span></TD>
                <TD className="font-mono text-xs text-muted-foreground">{l.latency}ms</TD>
                <TD className="font-mono text-xs text-muted-foreground">{l.requestId}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetail(null)} />
          <div className="relative z-10 h-full w-full max-w-md overflow-auto border-l border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading font-bold">Log detail</h2>
              <button onClick={() => setDetail(null)} className="rounded-full p-1 text-muted-foreground hover:bg-accent"><X size={20} /></button>
            </div>
            <p className="mb-3 font-mono text-xs text-muted-foreground">{detail.requestId}</p>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request</p>
            <pre className="mb-4 overflow-auto rounded-xl bg-[#0c0c16] p-4 font-mono text-xs text-info">{JSON.stringify({ method: detail.method, endpoint: detail.endpoint, headers: { authorization: 'Bearer alp_sk_••••' } }, null, 2)}</pre>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response</p>
            <pre className="overflow-auto rounded-xl bg-[#0c0c16] p-4 font-mono text-xs text-success">{JSON.stringify({ status: detail.status, latencyMs: detail.latency, env: detail.env }, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
