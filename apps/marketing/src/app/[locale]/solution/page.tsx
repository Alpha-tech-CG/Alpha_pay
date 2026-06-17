import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { use } from 'react';
import Reveal from '@/components/Reveal';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'solution' });
  return { title: t('metaTitle') };
}

export default function SolutionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('solution');
  const blocks = [
    { title: t('block1Title'), text: t('block1Text') },
    { title: t('block2Title'), text: t('block2Text') },
    { title: t('block3Title'), text: t('block3Text') },
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 py-20">
      <h1 className="text-4xl font-black tracking-tight">{t('title')}</h1>
      <p className="mt-4 max-w-2xl text-lg text-[var(--pb-muted)]">{t('subtitle')}</p>
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {blocks.map((b, i) => (
          <Reveal key={b.title} delay={i * 0.1}>
            <div className="h-full rounded-2xl border border-[var(--pb-border)] bg-white p-6">
              <div className="text-base font-bold">{b.title}</div>
              <p className="mt-2 text-sm text-[var(--pb-muted)]">{b.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
