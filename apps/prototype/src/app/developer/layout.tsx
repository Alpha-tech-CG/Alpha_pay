'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, KeyRound, FlaskConical, Zap, Webhook, ScrollText, BookOpen, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountSwitcher } from '@/components/AccountSwitcher';

const NAV = [
  { href: '/developer/overview', label: 'Overview', Icon: Home },
  { href: '/developer/keys', label: 'API Keys', Icon: KeyRound },
  { href: '/developer/sandbox', label: 'Sandbox', Icon: FlaskConical },
  { href: '/developer/console', label: 'API Console', Icon: Zap },
  { href: '/developer/webhooks', label: 'Webhooks', Icon: Webhook },
  { href: '/developer/logs', label: 'Logs', Icon: ScrollText },
  { href: '/developer/docs', label: 'Docs', Icon: BookOpen },
  { href: '/developer/billing', label: 'Billing', Icon: CreditCard },
];

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-[#12121f] p-4 md:flex">
        <Link href="/login" className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground">AP</div>
          <span className="font-heading font-bold">AlphaPay <span className="text-xs font-normal text-muted-foreground">/ dev</span></span>
        </Link>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-bold text-warning">
          <span className="h-2 w-2 rounded-full bg-warning" /> SANDBOX MODE
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                <n.Icon size={18} /> {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm text-muted-foreground">Developer portal</span>
          <AccountSwitcher active="developer" />
        </header>
        <main className="flex-1 p-5 pb-24 md:pb-5">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card/95 px-1 py-2 backdrop-blur md:hidden">
          {NAV.slice(0, 5).map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} className="flex flex-1 flex-col items-center gap-1">
                <n.Icon size={20} className={active ? 'text-primary' : 'text-muted-foreground'} />
                <span className={cn('text-[9px]', active ? 'text-primary' : 'text-muted-foreground')}>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
