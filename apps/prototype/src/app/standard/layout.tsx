'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ArrowUpRight, ArrowDownLeft, CreditCard, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountSwitcher } from '@/components/AccountSwitcher';

const TABS = [
  { href: '/standard/home', label: 'Home', Icon: Home },
  { href: '/standard/send', label: 'Send', Icon: ArrowUpRight },
  { href: '/standard/receive', label: 'Receive', Icon: ArrowDownLeft },
  { href: '/standard/card', label: 'Card', Icon: CreditCard },
  { href: '/standard/history', label: 'History', Icon: Receipt },
];

export default function StandardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col border-x border-border bg-background">
      <header className="flex items-center justify-between px-5 py-3">
        <Link href="/login" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground squircle">AP</div>
          <span className="font-heading text-sm font-bold">AlphaPay</span>
        </Link>
        <AccountSwitcher active="standard" />
      </header>

      <main className="flex-1 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-center justify-around border-t border-border bg-card/95 px-2 py-2 backdrop-blur">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} className="flex flex-1 flex-col items-center gap-1 py-1">
              <t.Icon size={22} className={cn(active ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-[10px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
