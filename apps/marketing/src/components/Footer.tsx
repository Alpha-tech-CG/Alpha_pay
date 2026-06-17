import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function Footer() {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--pb-border)] bg-[var(--pb-soft)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-3">
        <div>
          <div className="text-lg font-black">Pay<span style={{ color: 'var(--pb-primary)' }}>Brain</span></div>
          <p className="mt-2 text-sm text-[var(--pb-muted)]">Groupe Alpha · Congo</p>
        </div>
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--pb-muted)]">{t('product')}</div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/solution" className="hover:underline">{nav('solution')}</Link></li>
            <li><Link href="/pricing" className="hover:underline">{nav('pricing')}</Link></li>
            <li><Link href="/documentation" className="hover:underline">{nav('docs')}</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--pb-muted)]">{t('legal')}</div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/mentions-legales" className="hover:underline">{t('mentions')}</Link></li>
            <li><Link href="/cgu" className="hover:underline">{t('cgu')}</Link></li>
            <li><Link href="/confidentialite" className="hover:underline">{t('privacy')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--pb-border)] px-5 py-4 text-center text-xs text-[var(--pb-muted)]">
        © {year} PayBrain — {t('rights')}
      </div>
    </footer>
  );
}
