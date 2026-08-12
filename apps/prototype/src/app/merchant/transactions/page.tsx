'use client';
import { useState } from 'react';
import { Search, Download, FileText } from 'lucide-react';
import { merchantTransactions } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, THead, TR, TH, TD } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { money, cn } from '@/lib/utils';

const OPS = ['All', 'MTN', 'Airtel'] as const;
const STATUSES = ['All', 'confirmed', 'pending', 'failed'] as const;

export default function MerchantTransactions() {
  const [op, setOp] = useState<(typeof OPS)[number]>('All');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = merchantTransactions.filter(
    (t) => (op === 'All' || t.operator === op) && (status === 'All' || t.status === status) && (q === '' || t.counterparty.includes(q)),
  );

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Transactions</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download size={16} /> CSV</Button>
          <Button variant="outline" size="sm"><FileText size={16} /> PDF</Button>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by phone number" className="pl-9" />
        </div>
        <Filter label="Operator" options={OPS} value={op} onChange={(v) => setOp(v as typeof op)} />
        <Filter label="Status" options={STATUSES} value={status} onChange={(v) => setStatus(v as typeof status)} />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
          <span className="font-semibold text-primary">{selected.size} selected</span>
          <Button size="sm" variant="outline">Export selected</Button>
        </div>
      )}

      <Card className="p-0">
        <Table>
          <THead>
            <TR>
              <TH className="w-8"></TH>
              <TH>Date</TH><TH>Customer</TH><TH>Operator</TH><TH>Amount</TH><TH>Fee</TH><TH>Net</TH><TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            {rows.slice(0, 50).map((t) => (
              <TR key={t.id} className="hover:bg-accent/40">
                <TD><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-[var(--primary)]" /></TD>
                <TD className="text-muted-foreground">{t.date}</TD>
                <TD className="font-mono text-xs">{t.counterparty}</TD>
                <TD><span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', t.operator === 'MTN' ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive')}>{t.operator}</span></TD>
                <TD className="font-mono">{money(t.amount)}</TD>
                <TD className="font-mono text-muted-foreground">{money(t.fee)}</TD>
                <TD className="font-mono font-semibold">{money(t.amount - t.fee)}</TD>
                <TD><StatusBadge status={t.status} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function Filter<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
