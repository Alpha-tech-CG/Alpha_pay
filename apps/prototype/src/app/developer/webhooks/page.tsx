'use client';
import { useState } from 'react';
import { Eye, EyeOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { webhook, webhookEvents, webhookDeliveries } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/misc';
import { Table, THead, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export default function DevWebhooks() {
  const [showSecret, setShowSecret] = useState(false);
  const [testSent, setTestSent] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="font-heading text-2xl font-bold">Webhooks</h1>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Endpoint URL</p>
            <p className="break-all font-mono text-sm">{webhook.url}</p>
            <div className="mt-3 flex items-center gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Secret</p>
              <code className="font-mono text-sm">{showSecret ? webhook.secret : 'whsec_••••••'}</code>
              <button onClick={() => setShowSecret((s) => !s)} className="text-primary">{showSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success"><CheckCircle2 size={13} /> {webhook.status}</span>
            <span className="text-xs text-muted-foreground">Last delivery: {webhook.lastDelivery}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-heading font-bold">Event subscriptions</h2>
        {webhookEvents.map((e) => (
          <div key={e.event} className="flex items-center justify-between border-b border-border py-3 last:border-0">
            <code className="font-mono text-sm">{e.event}</code>
            <Switch defaultOn={e.enabled} />
          </div>
        ))}
        <Button className="mt-4" onClick={() => setTestSent(true)}>Send test webhook</Button>
        {testSent && <p className="mt-2 text-xs text-success">✅ Test event delivered · 200 OK · 118ms</p>}
      </Card>

      <Card className="p-0">
        <p className="p-5 pb-0 font-heading font-bold">Delivery log</p>
        <Table>
          <THead><TR><TH>Timestamp</TH><TH>Event</TH><TH>Code</TH><TH>Latency</TH><TH></TH></TR></THead>
          <tbody>
            {webhookDeliveries.map((d) => (
              <TR key={d.id}>
                <TD className="font-mono text-xs text-muted-foreground">{d.timestamp}</TD>
                <TD className="font-mono text-xs">{d.event}</TD>
                <TD><span className={cn('font-mono text-xs font-bold', d.code < 300 ? 'text-success' : 'text-destructive')}>{d.code}</span></TD>
                <TD className="font-mono text-xs text-muted-foreground">{d.latency}ms</TD>
                <TD><button className="flex items-center gap-1 text-xs text-primary"><RefreshCw size={12} /> Retry</button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
