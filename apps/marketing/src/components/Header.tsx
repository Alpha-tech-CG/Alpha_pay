'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { Logo } from '@/components/Frames';

export default function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const other = locale === 'fr' ? 'en' : 'fr';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '/#fonctionnalites', label: t('features') },
    { href: '/#etapes', label: t('how') },
    { href: '/pricing', label: t('pricing') },
    { href: '/developer', label: t('developer') },
    { href: '/contact', label: t('contact') },
  ];

  return (
    <header className={`sticky top-0 z-30 transition-all ${scrolled ? 'bg-[var(--ap-bg)]/85 shadow-[0_1px_0_var(--ap-line)] backdrop-blur' : 'bg-transparent'}`}>
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-6 px-5 py-4">
        <Link href="/" aria-label="AlphaPay, accueil">
          <Logo />
        </Link>
        <nav className="ml-auto hidden items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ring-[var(--ap-line)] md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-4 py-2 text-sm font-medium text-[var(--ap-ink-soft)] transition-colors hover:bg-[var(--ap-navy-soft)] hover:text-[var(--ap-navy)]">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-4">
          <Link href={pathname} locale={other} className="text-xs font-semibold text-[var(--ap-muted)] hover:text-[var(--ap-ink)]">
            {other.toUpperCase()}
          </Link>
          <Link href="/contact" className="hidden rounded-full bg-[var(--ap-mustard)] px-5 py-2.5 text-sm font-semibold text-[var(--ap-navy)] shadow-sm transition-transform hover:-translate-y-0.5 sm:inline-block">
            {t('cta')}
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-[var(--ap-line)] md:hidden" aria-label="Menu" aria-expanded={open}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="mx-5 mb-3 flex flex-col gap-1 rounded-2xl bg-white p-3 ring-1 ring-[var(--ap-line)] md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--ap-navy-soft)]">
              {l.label}
            </Link>
          ))}
          <Link href="/contact" onClick={() => setOpen(false)} className="mt-1 rounded-xl bg-[var(--ap-mustard)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--ap-navy)]">
            {t('cta')}
          </Link>
        </nav>
      )}
    </header>
  );
}
