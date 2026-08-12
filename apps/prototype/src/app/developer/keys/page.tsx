'use client';
import { useState } from 'react';
import { Plus, Eye, Copy, Check } from 'lucide-react';
import { apiKeys, apiScopes } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Table, THead, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export default function DevKeys() {
  const [env, setEnv] = useState<'Sandbox' | 'Production'>('Sandbox');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [name, setName] = useState('');

  const rows = apiKeys.filter((k) => k.env === env);

  const doCreate = () => {
    setCreated('alp_sk_' + (env === 'Sandbox' ? 'test' : 'live') + '_' + Math.random().toString(36).slice(2, 14));
    setCreating(false);
    setName('');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">API Keys</h1>
        <Button size="sm" onClick={() => setCreating(true)}><Plus size={16} /> Create API Key</Button>
      </div>

      <div className="flex rounded-xl border border-border bg-card p-1">
        {(['Sandbox', 'Production'] as const).map((e) => (
          <button key={e} onClick={() => setEnv(e)} className={cn('rounded-lg px-5 py-1.5 text-xs font-bold', env === e ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{e}</button>
        ))}
      </div>

      <Card className="p-0">
        <Table>
          <THead><TR><TH>Key name</TH><TH>Prefix</TH><TH>Created</TH><TH>Last used</TH><TH>Scopes</TH><TH>Actions</TH></TR></THead>
          <tbody>
            {rows.map((k) => (
              <TR key={k.prefix}>
                <TD className="font-medium">{k.name}</TD>
                <TD className="font-mono text-xs">{k.prefix}</TD>
                <TD className="text-muted-foreground">{k.created}</TD>
                <TD className="text-muted-foreground">{k.lastUsed}</TD>
                <TD className="text-xs text-muted-foreground">{k.scopes}</TD>
                <TD>
                  <div className="flex gap-2">
                    <button className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-accent"><Eye size={13} /> Reveal</button>
                    <button onClick={() => setRevoke(k.name)} className="rounded-lg border border-border px-2 py-1 text-xs text-destructive hover:bg-accent">Revoke</button>
                  </div>
                </TD>
              </TR>
            ))}
            {rows.length === 0 && <TR><TD className="py-6 text-center text-muted-foreground">No keys in {env}.</TD></TR>}
          </tbody>
        </Table>
      </Card>

      {/* Create modal */}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Create API Key">
        <div className="space-y-4">
          <div><Label>Key name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My integration key" /></div>
          <div>
            <Label>Scopes</Label>
            <div className="space-y-2">
              {apiScopes.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="accent-[var(--primary)]" /> <span className="font-mono text-xs">{s}</span></label>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={doCreate}>Create key</Button>
        </div>
      </Dialog>

      {/* One-time reveal */}
      <Dialog open={!!created} onClose={() => setCreated(null)} title="Copy your API key now">
        <p className="mb-3 text-sm text-muted-foreground">This key is shown once and then masked forever.</p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-input p-3">
          <code className="flex-1 break-all font-mono text-sm">{created}</code>
          <button onClick={() => navigator.clipboard?.writeText(created ?? '')} className="text-primary"><Copy size={18} /></button>
        </div>
        <Button className="mt-4 w-full" onClick={() => setCreated(null)}><Check size={16} /> I've saved it</Button>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={!!revoke} onClose={() => setRevoke(null)} title="Revoke API key">
        <p className="text-sm text-muted-foreground">Revoking <span className="font-semibold text-foreground">{revoke}</span> is permanent. Any app using it will stop working immediately.</p>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setRevoke(null)}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={() => setRevoke(null)}>Revoke</Button>
        </div>
      </Dialog>
    </div>
  );
}
