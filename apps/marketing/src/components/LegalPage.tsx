import { getTranslations } from 'next-intl/server';

type Section = { h: string; p: string };

export default async function LegalPage({
  locale,
  titleKey,
  sections,
}: {
  locale: string;
  titleKey: 'mentionsTitle' | 'cguTitle' | 'privacyTitle';
  sections: Section[];
}) {
  const t = await getTranslations({ locale, namespace: 'legal' });
  return (
    <article className="mx-auto max-w-3xl px-5 py-20">
      <h1 className="text-3xl font-black tracking-tight">{t(titleKey)}</h1>
      <p className="mt-2 text-sm text-[var(--pb-muted)]">
        {t('lastUpdate')} : {new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
      </p>
      <div className="mt-8 space-y-6">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-bold">{s.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--pb-muted)]">{s.p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
