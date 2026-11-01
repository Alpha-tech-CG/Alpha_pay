import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations, getMessages } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Analytics from '@/components/Analytics';
import { IBM_Plex_Sans } from 'next/font/google';
import '../globals.css';

// Police de l'app mobile (IBM Plex Sans), servie par next/font : aucune requête vers Google côté visiteur.
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    metadataBase: new URL('https://alphapay.cg'),
    title,
    description,
    openGraph: { title, description, type: 'website', locale, siteName: 'AlphaPay' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { languages: { fr: '/fr', en: '/en' } },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={plex.variable}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Analytics />
          <Header />
          <main>{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
