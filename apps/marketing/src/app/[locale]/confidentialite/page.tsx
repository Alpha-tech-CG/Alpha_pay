import { setRequestLocale } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';

const CONTENT: Record<string, { h: string; p: string }[]> = {
  fr: [
    { h: 'Données collectées', p: 'Nous collectons les données strictement nécessaires : email (liste d’attente, contact), et données de compte marchand le cas échéant.' },
    { h: 'Finalité', p: 'Les données servent à vous recontacter, fournir le service et améliorer la plateforme. Aucune revente à des tiers.' },
    { h: 'Conservation', p: 'Les données sont conservées le temps nécessaire à la finalité, puis supprimées ou anonymisées.' },
    { h: 'Vos droits', p: 'Vous disposez d’un droit d’accès, de rectification et de suppression. Contact : privacy@paybrain.cg.' },
  ],
  en: [
    { h: 'Data collected', p: 'We collect strictly necessary data: email (waitlist, contact), and merchant account data where applicable.' },
    { h: 'Purpose', p: 'Data is used to contact you, provide the service and improve the platform. No resale to third parties.' },
    { h: 'Retention', p: 'Data is kept for as long as necessary for the purpose, then deleted or anonymized.' },
    { h: 'Your rights', p: 'You have the right to access, rectify and delete your data. Contact: privacy@paybrain.cg.' },
  ],
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} titleKey="privacyTitle" sections={CONTENT[locale] ?? CONTENT.fr} />;
}
