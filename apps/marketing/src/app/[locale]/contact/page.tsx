import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { use } from 'react';
import ContactForm from '@/components/ContactForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return { title: t('metaTitle') };
}

export default function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('contact');
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <h1 className="text-4xl font-black tracking-tight">{t('title')}</h1>
      <p className="mt-4 text-lg text-[var(--pb-muted)]">{t('subtitle')}</p>
      <div className="mt-10">
        <ContactForm />
      </div>
    </div>
  );
}
