import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Logo } from '@/components/Frames';

export default function Footer() {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[var(--ap-navy)] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo className="text-white" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">{t('tagline')}</p>
          <p className="mt-3 text-sm text-white/45">Groupe Alpha · Brazzaville, Congo</p>
        </div>
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ap-mustard)]">{t('product')}</div>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link href="/#fonctionnalites" className="hover:text-white">{nav('features')}</Link></li>
            <li><Link href="/pricing" className="hover:text-white">{nav('pricing')}</Link></li>
            <li><Link href="/developer" className="hover:text-white">{nav('developer')}</Link></li>
            <li><Link href="/documentation" className="hover:text-white">{nav('docs')}</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ap-mustard)]">{t('legal')}</div>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link href="/mentions-legales" className="hover:text-white">{t('mentions')}</Link></li>
            <li><Link href="/cgu" className="hover:text-white">{t('cgu')}</Link></li>
            <li><Link href="/confidentialite" className="hover:text-white">{t('privacy')}</Link></li>
            <li><Link href="/contact" className="hover:text-white">{nav('contact')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-white/45">
        © {year} AlphaPay · {t('rights')}
      </div>
    </footer>
  );
}
