'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Radio } from 'lucide-react';
import { merchantKpis, revenue7Days, operatorSplit } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { BarChart, Donut } from '@/components/charts';
import { money } from '@/lib/utils';

interface LiveTx { id: number; op: 'MTN' | 'Airtel'; phone: string; amount: number; time: string; status: 'confirmed' | 'pending' }

function genTx(id: number): LiveTx {
  const op = Math.random() > 0.4 ? 'MTN' : 'Airtel';
  const amount = 500 + Math.floor(Math.random() * 20000);
  const now = new Date();
  return {
    id,
    op,
    phone: `+242 0${op === 'MTN' ? 6 : 5} ••• ${String(Math.floor(Math.random() * 9000) + 1000)}`,
    amount,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
    status: Math.random() > 0.1 ? 'confirmed' : 'pending',
  };
}

export default function MerchantDashboard() {
  const [feed, setFeed] = useState<LiveTx[]>(() => Array.from({ length: 6 }, (_, i) => genTx(i)));
  useEffect(() => {
    let id = 100;
    const t = setInterval(() => setFeed((f) => [genTx(id++), ...f].slice(0, 8)), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Today's revenue" value={money(merchantKpis.revenueToday)} delta={merchantKpis.revenueDeltaPct} />
        <Kpi label="Transactions today" value={String(merchantKpis.txToday)} />
        <Kpi label="Average ticket" value={money(merchantKpis.avgTicket)} />
        <Kpi label="Failed rate" value={`${merchantKpis.failedRatePct}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-heading font-bold">Revenue — last 7 days</h2>
          <BarChart data={revenue7Days} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-heading font-bold">Operator split</h2>
          <Donut segments={operatorSplit} />
        </Card>
      </div>

      {/* Live feed */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Radio size={18} className="text-success" />
          <h2 className="font-heading font-bold">Live transactions</h2>
          <span className="ml-1 flex h-2 w-2 animate-pulse rounded-full bg-success" />
        </div>
        <div className="space-y-2">
          {feed.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold ${t.op === 'MTN' ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'}`}>{t.op}</span>
                <div>
                  <p className="text-sm font-medium">{t.phone}</p>
                  <p className="text-xs text-muted-foreground">{t.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold text-success">+{money(t.amount)}</p>
                <p className={`text-xs ${t.status === 'confirmed' ? 'text-success' : 'text-warning'}`}>{t.status}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-black">{value}</p>
      {delta !== undefined && (
        <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${delta >= 0 ? 'text-success' : 'text-destructive'}`}>
          {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {delta >= 0 ? '+' : ''}{delta}% vs yesterday
        </p>
      )}
    </Card>
  );
}
