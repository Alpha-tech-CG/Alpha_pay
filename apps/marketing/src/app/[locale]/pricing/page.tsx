import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/routing';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return { title: t('metaTitle') };
}

export default function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('pricing');

  const plans = [
    { name: t('planStarterName'), price: t('planStarterPrice'), suffix: t('perMonth'), desc: t('planStarterDesc'), feats: [t('planStarterF1'), t('planStarterF2'), t('planStarterF3')], highlight: false },
    { name: t('planProName'), price: t('planProPrice'), suffix: '', desc: t('planProDesc'), feats: [t('planProF1'), t('planProF2'), t('planProF3')], highlight: true },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-20">
      <h1 className="text-center text-4xl font-black tracking-tight">{t('title')}</h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-lg text-[var(--pb-muted)]">{t('subtitle')}</p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {plans.map((p) => (
          <div
            key={p.name}
            className="rounded-3xl border bg-white p-8"
            style={{ borderColor: p.highlight ? 'var(--pb-primary)' : 'var(--pb-border)', boxShadow: p.highlight ? '0 10px 30px rgba(59,86,240,0.12)' : 'none' }}
          >
            <div className="text-sm font-bold uppercase tracking-wide text-[var(--pb-muted)]">{p.name}</div>
            <div className="mt-3 text-4xl font-black">{p.price}<span className="text-base font-medium text-[var(--pb-muted)]">{p.suffix}</span></div>
            <p className="mt-2 text-sm text-[var(--pb-muted)]">{p.desc}</p>
            <ul className="mt-6 space-y-2 text-sm">
              {p.feats.map((f) => (
                <li key={f} className="flex items-center gap-2"><span style={{ color: 'var(--pb-primary)' }}>✓</span> {f}</li>
              ))}
            </ul>
            <Link href="/contact" className="mt-8 block rounded-lg px-5 py-3 text-center text-sm font-semibold" style={{ background: p.highlight ? 'var(--pb-primary)' : 'var(--pb-soft)', color: p.highlight ? '#fff' : 'var(--pb-ink)' }}>
              {t('cta')}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
