'use client';
import { useState } from 'react';
import { Plus, QrCode, BarChart3, Pencil, Trash2 } from 'lucide-react';
import { terminals as seedTerminals } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { money } from '@/lib/utils';

export default function MerchantTerminals() {
  const [terminals, setTerminals] = useState(seedTerminals);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const add = () => {
    if (!name.trim()) return;
    const n = terminals.length + 1;
    setTerminals([...terminals, { id: `ALP-T-00${n}`, name: name.trim(), revenueToday: 0 }]);
    setName('');
    setAdding(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Terminals</h1>
        <Button size="sm" onClick={() => setAdding(true)}><Plus size={16} /> Add Terminal</Button>
      </div>

      <div className="space-y-3">
        {terminals.map((t) => (
          <Card key={t.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><QrCode size={24} /></div>
              <div>
                <h2 className="font-heading font-bold">{t.name}</h2>
                <p className="text-xs text-muted-foreground">QR: {t.id}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Revenue today</p>
              <p className="font-mono font-bold">{money(t.revenueToday)}</p>
            </div>
            <div className="flex gap-2">
              <IconBtn Icon={QrCode} title="View QR" />
              <IconBtn Icon={BarChart3} title="Stats" />
              <IconBtn Icon={Pencil} title="Rename" />
              <IconBtn Icon={Trash2} title="Delete" danger onClick={() => setTerminals((ts) => ts.filter((x) => x.id !== t.id))} />
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add terminal">
        <div className="space-y-4">
          <div><Label>Terminal name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Caisse 2" /></div>
          <Button className="w-full" onClick={add}>Generate QR & create</Button>
        </div>
      </Dialog>
    </div>
  );
}

function IconBtn({ Icon, title, danger, onClick }: { Icon: typeof QrCode; title: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} title={title} className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent ${danger ? 'text-destructive' : 'text-muted-foreground'}`}>
      <Icon size={16} />
    </button>
  );
}
