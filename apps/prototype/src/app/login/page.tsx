import Link from 'next/link';
import { User, Store, Code2, ChevronRight, ShieldCheck } from 'lucide-react';

const ACCOUNTS = [
  {
    href: '/standard/home',
    Icon: User,
    title: 'Standard',
    desc: 'Send, receive, pay by QR, virtual card',
    tint: 'bg-primary/10 text-primary',
  },
  {
    href: '/merchant/dashboard',
    Icon: Store,
    title: 'Merchant',
    desc: 'Accept payments, dashboard, reports, terminals',
    tint: 'bg-success/10 text-success',
  },
  {
    href: '/developer/overview',
    Icon: Code2,
    title: 'Developer',
    desc: 'API keys, sandbox, webhooks, logs',
    tint: 'bg-info/10 text-info',
  },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground squircle">
          AP
        </div>
        <h1 className="font-heading text-3xl font-black tracking-tight">AlphaPay</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose an account type to enter</p>
        <p className="mt-1 text-xs text-muted-foreground/70">Prototype — no real authentication</p>
      </div>

      <div className="space-y-3">
        {ACCOUNTS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary squircle"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${a.tint}`}>
              <a.Icon size={24} />
            </div>
            <div className="flex-1">
              <h2 className="font-heading font-bold">{a.title}</h2>
              <p className="text-xs text-muted-foreground">{a.desc}</p>
            </div>
            <ChevronRight size={20} className="text-muted-foreground" />
          </Link>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} className="text-success" />
        <span>Congo 🇨🇬 · Libya 🇱🇾 — one interface, every rail</span>
      </div>
    </main>
  );
}
