'use client';
import { developer } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';

export default function DevBilling() {
  const pct = (developer.callsMonth / developer.callsQuota) * 100;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Billing</h1>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold">{developer.plan} plan</span>
            <p className="mt-2 text-sm text-muted-foreground">{developer.callsMonth.toLocaleString('fr-FR')} / {developer.callsQuota.toLocaleString('fr-FR')} calls used</p>
          </div>
          <p className="font-heading text-2xl font-black">{pct.toFixed(1)}%</p>
        </div>
        <div className="mt-4"><Progress value={pct} /></div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading font-bold">Upgrade to Pro Dev</h2>
            <p className="text-sm text-muted-foreground">Unlimited API calls · priority support</p>
          </div>
          <div className="text-right">
            <p className="font-heading text-xl font-black">10 000 XAF<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            <Button size="sm" className="mt-2">Upgrade</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 font-heading font-bold">Invoice history</h2>
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No invoices yet — you're on the Free plan.</div>
      </Card>
    </div>
  );
}
