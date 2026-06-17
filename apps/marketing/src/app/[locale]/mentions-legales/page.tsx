import { setRequestLocale } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';

const CONTENT: Record<string, { h: string; p: string }[]> = {
  fr: [
    { h: 'Éditeur', p: 'Le présent site est édité par Groupe Alpha, société en cours d’immatriculation au Congo. Contact : contact@paybrain.cg.' },
    { h: 'Hébergement', p: 'Le site est hébergé sur une plateforme de déploiement statique (Cloudflare Pages / Vercel).' },
    { h: 'Propriété intellectuelle', p: 'L’ensemble des contenus (textes, marques, logos) est la propriété de Groupe Alpha, sauf mention contraire.' },
  ],
  en: [
    { h: 'Publisher', p: 'This website is published by Groupe Alpha, a company being incorporated in Congo. Contact: contact@paybrain.cg.' },
    { h: 'Hosting', p: 'The site is hosted on a static deployment platform (Cloudflare Pages / Vercel).' },
    { h: 'Intellectual property', p: 'All content (text, trademarks, logos) is the property of Groupe Alpha unless otherwise stated.' },
  ],
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} titleKey="mentionsTitle" sections={CONTENT[locale] ?? CONTENT.fr} />;
}
