'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, QrCode, Receipt, FileBarChart, MonitorSmartphone, CreditCard, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountSwitcher } from '@/components/AccountSwitcher';
import { merchant } from '@/lib/mock-data';

const NAV = [
  { href: '/merchant/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/merchant/qr', label: 'My QR Code', Icon: QrCode },
  { href: '/merchant/transactions', label: 'Transactions', Icon: Receipt },
  { href: '/merchant/reports', label: 'Reports', Icon: FileBarChart },
  { href: '/merchant/terminals', label: 'Terminals', Icon: MonitorSmartphone },
  { href: '/merchant/subscription', label: 'Subscription', Icon: CreditCard },
  { href: '/merchant/settings', label: 'Settings', Icon: Settings },
];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card p-4 md:flex">
        <Link href="/login" className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground">AP</div>
          <span className="font-heading font-bold">AlphaPay</span>
        </Link>
        <p className="mb-2 px-3 text-xs uppercase tracking-wider text-muted-foreground">{merchant.business}</p>
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
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[10px] font-black text-primary-foreground">AP</div>
            <span className="font-heading text-sm font-bold">{merchant.business}</span>
          </div>
          <span className="hidden text-sm text-muted-foreground md:block">Merchant dashboard · {merchant.id}</span>
          <AccountSwitcher active="merchant" />
        </header>

        <main className="flex-1 p-5 pb-24 md:pb-5">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card/95 px-1 py-2 backdrop-blur md:hidden">
          {NAV.slice(0, 5).map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} className="flex flex-1 flex-col items-center gap-1">
                <n.Icon size={20} className={active ? 'text-primary' : 'text-muted-foreground'} />
                <span className={cn('text-[9px]', active ? 'text-primary' : 'text-muted-foreground')}>{n.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
