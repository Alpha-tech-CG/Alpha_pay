'use client';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { revenue7Days } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { LineChart } from '@/components/charts';
import { money, cn } from '@/lib/utils';

const PERIODS = ['This week', 'This month', 'Last month', 'Custom'] as const;

export default function MerchantReports() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('This week');
  const total = revenue7Days.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Reports</h1>
        <Button variant="outline" size="sm"><FileText size={16} /> Export report PDF</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-full border px-4 py-1.5 text-xs font-semibold', period === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{p}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total revenue" value={money(total)} />
        <Stat label="Total fees" value={money(Math.round(total * 0.018))} />
        <Stat label="Net received" value={money(Math.round(total * 0.982))} />
        <Stat label="Transactions" value="241" />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Revenue trend</h2>
        <LineChart data={revenue7Days} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-heading font-bold">Top hours</h2>
        <Heatmap />
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-heading font-bold">Automatic reports</h2>
        <p className="mb-4 text-sm text-muted-foreground">Receive your report by email on a schedule.</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><Switch /> <span className="text-sm">Enabled</span></div>
          <Input placeholder="reports@boutique-alpha.cg" className="max-w-xs" />
          <select className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none">
            <option>Daily</option><option>Weekly</option><option>Monthly</option>
          </select>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-heading text-xl font-black">{value}</p></Card>;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function Heatmap() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="mb-1 flex gap-1 pl-10 text-[9px] text-muted-foreground">
          {Array.from({ length: 24 }).map((_, h) => <span key={h} className="w-4 text-center">{h % 3 === 0 ? h : ''}</span>)}
        </div>
        {DAYS.map((d, di) => (
          <div key={d} className="mb-1 flex items-center gap-1">
            <span className="w-9 text-[10px] text-muted-foreground">{d}</span>
            {Array.from({ length: 24 }).map((_, h) => {
              const v = (Math.sin(di * 1.3 + h * 0.7) + 1) / 2 * ((h > 8 && h < 21) ? 1 : 0.3);
              return <span key={h} className="h-4 w-4 rounded-sm" style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(v * 100)}%, var(--muted))` }} title={`${d} ${h}h`} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
