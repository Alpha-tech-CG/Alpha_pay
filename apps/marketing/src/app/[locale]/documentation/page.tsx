import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { use } from 'react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'docs' });
  return { title: t('metaTitle') };
}

export default function DocumentationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('docs');
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <h1 className="text-4xl font-black tracking-tight">{t('title')}</h1>
      <p className="mt-4 text-lg text-[var(--pb-muted)]">{t('subtitle')}</p>
      <div className="mt-10 space-y-4">
        <a href="/docs" className="block rounded-2xl border border-[var(--pb-border)] bg-white p-6 hover:border-[var(--pb-primary)]">
          <div className="font-bold">{t('openapi')}</div>
          <div className="mt-1 text-sm text-[var(--pb-muted)]">/docs</div>
        </a>
        <a href="https://github.com/mastefox2742/Alphapay/blob/main/docs/api/DEVELOPER_GUIDE.md" className="block rounded-2xl border border-[var(--pb-border)] bg-white p-6 hover:border-[var(--pb-primary)]">
          <div className="font-bold">{t('guide')}</div>
          <div className="mt-1 text-sm text-[var(--pb-muted)]">DEVELOPER_GUIDE.md</div>
        </a>
      </div>
    </div>
  );
}
