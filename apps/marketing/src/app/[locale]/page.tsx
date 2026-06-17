import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/routing';
import Reveal from '@/components/Reveal';
import WaitlistForm from '@/components/WaitlistForm';

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('home');

  const features = [
    { title: t('feature1Title'), text: t('feature1Text') },
    { title: t('feature2Title'), text: t('feature2Text') },
    { title: t('feature3Title'), text: t('feature3Text') },
  ];

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 text-center">
        <Reveal>
          <span className="inline-block rounded-full bg-[var(--pb-soft)] px-3 py-1 text-xs font-semibold text-[var(--pb-primary)]">
            {t('heroBadge')}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-[var(--pb-muted)]">{t('heroSubtitle')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="rounded-lg px-6 py-3 text-sm font-semibold text-white" style={{ background: 'var(--pb-primary)' }}>
              {t('heroCtaPrimary')}
            </Link>
            <Link href="/documentation" className="rounded-lg border border-[var(--pb-border)] px-6 py-3 text-sm font-semibold">
              {t('heroCtaSecondary')}
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-[var(--pb-border)] bg-white p-6">
                <div className="text-base font-bold">{f.title}</div>
                <p className="mt-2 text-sm text-[var(--pb-muted)]">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <Reveal>
          <div className="rounded-3xl bg-[var(--pb-soft)] p-10 text-center">
            <h2 className="text-2xl font-black">{t('trustTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[var(--pb-muted)]">{t('trustText')}</p>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-2xl px-5 py-16">
        <WaitlistForm />
      </section>
    </>
  );
}
