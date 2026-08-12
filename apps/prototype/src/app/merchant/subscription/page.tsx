'use client';
import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { merchant, merchantInvoices } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/misc';
import { Table, THead, TR, TH, TD } from '@/components/ui/table';
import { money } from '@/lib/utils';

const FEATURES = [
  { name: 'Transactions / month', free: 'Up to 100', pro: 'Unlimited' },
  { name: 'QR codes', free: '1', pro: 'Multi-terminal' },
  { name: 'Reports & exports', free: false, pro: true },
  { name: 'Live dashboard', free: true, pro: true },
  { name: 'Priority support', free: false, pro: true },
];

export default function MerchantSubscription() {
  const [changing, setChanging] = useState(false);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Subscription</h1>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">{merchant.plan}</span>
            <p className="mt-2 font-heading text-2xl font-black">{money(merchant.planPrice)}<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            <p className="text-sm text-muted-foreground">Renews {merchant.renews}</p>
          </div>
          <Button onClick={() => setChanging(true)}>Change plan</Button>
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-sm"><span className="text-muted-foreground">Usage this month</span><span className="font-semibold">847 transactions · Unlimited</span></div>
          <Progress value={50} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Free vs Pro</h2>
        <Table>
          <THead><TR><TH>Feature</TH><TH>Free</TH><TH>Pro</TH></TR></THead>
          <tbody>
            {FEATURES.map((f) => (
              <TR key={f.name}>
                <TD className="font-medium">{f.name}</TD>
                <TD><Cell v={f.free} /></TD>
                <TD><Cell v={f.pro} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Invoice history</h2>
        <Table>
          <THead><TR><TH>Period</TH><TH>Amount</TH><TH>Date</TH><TH>Status</TH></TR></THead>
          <tbody>
            {merchantInvoices.map((i) => (
              <TR key={i.period}>
                <TD className="font-medium">{i.period}</TD>
                <TD className="font-mono">{money(i.amount)}</TD>
                <TD className="text-muted-foreground">{i.date}</TD>
                <TD><span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Paid</span></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={changing} onClose={() => setChanging(false)} title="Change plan">
        <div className="space-y-3">
          <button className="w-full rounded-xl border border-border p-4 text-left hover:border-primary"><p className="font-bold">Free</p><p className="text-sm text-muted-foreground">0 XAF/month · up to 100 tx</p></button>
          <button className="w-full rounded-xl border border-primary bg-primary/5 p-4 text-left"><p className="font-bold text-primary">Pro — current</p><p className="text-sm text-muted-foreground">5,000 XAF/month · unlimited</p></button>
        </div>
      </Dialog>
    </div>
  );
}

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check size={16} className="text-success" />;
  if (v === false) return <Minus size={16} className="text-muted-foreground" />;
  return <span className="text-sm">{v}</span>;
}
