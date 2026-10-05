import { setRequestLocale } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';

const CONTENT: Record<string, { h: string; p: string }[]> = {
  fr: [
    { h: 'Objet', p: 'Les présentes conditions régissent l’utilisation du site et des services AlphaPay. En accédant au site, vous les acceptez.' },
    { h: 'Accès au service', p: 'L’accès aux services de paiement est soumis à validation du compte marchand et au respect de la réglementation applicable.' },
    { h: 'Responsabilité', p: 'AlphaPay met en œuvre les moyens nécessaires pour assurer la disponibilité du service sans garantie d’absence totale d’interruption.' },
    { h: 'Modification', p: 'Ces conditions peuvent évoluer ; la version en vigueur est celle publiée sur le site.' },
  ],
  en: [
    { h: 'Purpose', p: 'These terms govern the use of the AlphaPay website and services. By accessing the site, you accept them.' },
    { h: 'Service access', p: 'Access to payment services is subject to merchant account validation and compliance with applicable regulations.' },
    { h: 'Liability', p: 'AlphaPay takes the necessary measures to ensure service availability without guaranteeing the complete absence of interruption.' },
    { h: 'Changes', p: 'These terms may change; the version in force is the one published on the site.' },
  ],
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} titleKey="cguTitle" sections={CONTENT[locale] ?? CONTENT.fr} />;
}
