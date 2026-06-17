import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const BASE = 'https://paybrain.cg';
const PATHS = ['', '/solution', '/pricing', '/documentation', '/contact', '/mentions-legales', '/cgu', '/confidentialite'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routing.locales.flatMap((locale) =>
    PATHS.map((p) => ({
      url: `${BASE}/${locale}${p}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: p === '' ? 1 : 0.7,
    })),
  );
}
