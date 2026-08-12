'use client';
import { Plus } from 'lucide-react';
import { merchant } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';

export default function MerchantSettings() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Settings</h1>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Business profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Business name</Label><Input defaultValue={merchant.business} /></div>
          <div><Label>Merchant ID</Label><Input defaultValue={merchant.id} disabled /></div>
          <div><Label>Sector</Label><Input defaultValue="Retail" /></div>
          <div><Label>Country</Label><Input defaultValue="Congo 🇨🇬" /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Notifications</h2>
        {['SMS per transaction', 'Push notifications', 'Email daily summary'].map((n) => (
          <div key={n} className="flex items-center justify-between border-b border-border py-3 last:border-0">
            <span className="text-sm">{n}</span><Switch defaultOn={n !== 'Email daily summary'} />
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-heading font-bold">Webhook</h2>
        <p className="mb-3 text-sm text-muted-foreground">Notify your own system on each payment.</p>
        <Label>Webhook URL</Label>
        <Input placeholder="https://myshop.cg/webhooks/alphapay" />
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading font-bold">Team</h2>
          <Button size="sm" variant="outline"><Plus size={16} /> Add cashier</Button>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold">FK</div>
            <div><p className="text-sm font-medium">Fatou Kello</p><p className="text-xs text-muted-foreground">Cashier · view-only</p></div>
          </div>
          <span className="text-xs text-muted-foreground">Active</span>
        </div>
      </Card>
    </div>
  );
}
