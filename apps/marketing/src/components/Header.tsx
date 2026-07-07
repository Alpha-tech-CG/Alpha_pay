'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

export default function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const other = locale === 'fr' ? 'en' : 'fr';

  const links = [
    { href: '/solution', label: t('solution') },
    { href: '/pricing', label: t('pricing') },
    { href: '/documentation', label: t('docs') },
    { href: '/contact', label: t('contact') },
    { href: '/developer', label: t('developer') },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--pb-border)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="text-xl font-black tracking-tight">
          Pay<span style={{ color: 'var(--pb-primary)' }}>Brain</span>
        </Link>
        <nav className="ml-4 hidden gap-6 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-[var(--pb-muted)] hover:text-[var(--pb-ink)]">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href={pathname} locale={other} className="text-xs font-semibold text-[var(--pb-muted)] hover:text-[var(--pb-ink)]">
            {other.toUpperCase()}
          </Link>
          <Link
            href="/contact"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: 'var(--pb-primary)' }}
          >
            {t('cta')}
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="md:hidden" aria-label="Menu">☰</button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-[var(--pb-border)] px-5 py-3 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2 text-sm font-medium">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
