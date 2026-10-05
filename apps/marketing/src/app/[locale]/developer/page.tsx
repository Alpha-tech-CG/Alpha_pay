import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import Reveal from '@/components/Reveal';
import DeveloperForm from '@/components/DeveloperForm';

export default function DeveloperPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  return (
    <>
      {/* Header */}
      <section className="mx-auto max-w-3xl px-5 pb-10 pt-20 text-center">
        <Reveal>
          <span
            className="inline-block rounded-full px-4 py-1.5 text-xs font-bold tracking-wide"
            style={{ background: 'var(--pb-soft-high)', color: 'var(--pb-primary)' }}
          >
            Compte développeur
          </span>
          <h1 className="mx-auto mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl"
              style={{ color: 'var(--pb-ink)' }}>
            Intégrez AlphaPay dans votre application
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed" style={{ color: 'var(--pb-muted)' }}>
            Accédez aux clés API REST, webhooks et documentation technique. Votre dossier est examiné sous 48h.
          </p>
        </Reveal>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-4xl px-5 pb-16">
        <Reveal>
          <div className="mb-10 grid grid-cols-3 gap-4">
            {[
              { n: '01', label: 'Remplissez le formulaire', sub: "Informations + pièce d'identité" },
              { n: '02', label: 'Vérification KYC', sub: 'Notre équipe valide sous 48h' },
              { n: '03', label: 'Accès immédiat', sub: 'Clé API + sandbox activés' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border p-5 text-center"
                   style={{ background: 'var(--pb-surface)', borderColor: 'var(--pb-border)' }}>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black"
                     style={{ background: 'var(--pb-soft-high)', color: 'var(--pb-primary)' }}>
                  {s.n}
                </div>
                <div className="text-sm font-bold" style={{ color: 'var(--pb-ink)' }}>{s.label}</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--pb-muted)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Form + what you get */}
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <Reveal>
            <div className="rounded-3xl border p-8"
                 style={{ background: 'var(--pb-surface)', borderColor: 'var(--pb-border)' }}>
              <h2 className="mb-6 text-xl font-black" style={{ color: 'var(--pb-ink)' }}>
                Votre demande d'accès développeur
              </h2>
              <DeveloperForm />
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="flex flex-col gap-4">
              {/* What you get */}
              <div className="rounded-2xl p-6" style={{ background: 'var(--pb-soft)' }}>
                <div className="mb-4 text-sm font-black" style={{ color: 'var(--pb-ink)' }}>
                  Ce que vous obtenez
                </div>
                {[
                  { icon: '🔑', label: 'Clé API sandbox + production' },
                  { icon: '📡', label: 'Webhooks sortants signés HMAC' },
                  { icon: '📖', label: 'Documentation OpenAPI complète' },
                  { icon: '📊', label: 'Dashboard transactions & analytics' },
                  { icon: '🔁', label: 'Reversements automatiques (vendredi)' },
                  { icon: '💬', label: 'Support technique prioritaire' },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-3 py-2.5 border-b last:border-0"
                       style={{ borderColor: 'var(--pb-border)' }}>
                    <span className="text-base">{f.icon}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--pb-ink)' }}>{f.label}</span>
                  </div>
                ))}
              </div>

              {/* KYC notice */}
              <div className="rounded-2xl border-l-4 p-5"
                   style={{ background: 'var(--pb-soft)', borderColor: 'var(--pb-primary)' }}>
                <div className="mb-1 text-sm font-bold" style={{ color: 'var(--pb-primary)' }}>
                  Vérification d'identité requise
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--pb-muted)' }}>
                  Pour accéder à l&apos;environnement de production, nous vérifions votre identité
                  conformément aux réglementations financières en vigueur en République du Congo.
                  Un document d&apos;identité valide (CNI ou passeport) est requis.
                </p>
              </div>

              {/* Already have a key */}
              <div className="rounded-2xl border p-5 text-center"
                   style={{ background: 'var(--pb-surface)', borderColor: 'var(--pb-border)' }}>
                <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--pb-ink)' }}>
                  Déjà un compte ?
                </div>
                <p className="mb-3 text-xs" style={{ color: 'var(--pb-muted)' }}>
                  Connectez-vous depuis l&apos;application mobile avec votre clé API.
                </p>
                <div className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
                     style={{ background: 'var(--pb-soft-high)', color: 'var(--pb-primary)' }}>
                  📱 Téléchargez AlphaPay
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
