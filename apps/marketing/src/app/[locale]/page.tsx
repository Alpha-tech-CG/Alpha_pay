import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/routing';
import Reveal from '@/components/Reveal';
import WaitlistForm from '@/components/WaitlistForm';

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('home');

  const features = [
    { icon: '⚡', title: t('feature1Title'), text: t('feature1Text') },
    { icon: '🔐', title: t('feature2Title'), text: t('feature2Text') },
    { icon: '📡', title: t('feature3Title'), text: t('feature3Text') },
    { icon: '📊', title: t('feature4Title'), text: t('feature4Text') },
    { icon: '🔁', title: t('feature5Title'), text: t('feature5Text') },
    { icon: '🌍', title: t('feature6Title'), text: t('feature6Text') },
  ];

  const steps = [
    { n: '01', title: t('step1Title'), text: t('step1Text') },
    { n: '02', title: t('step2Title'), text: t('step2Text') },
    { n: '03', title: t('step3Title'), text: t('step3Text') },
  ];

  return (
    <>
      {/* ── HERO ── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-24 text-center">
        <Reveal>
          <span
            className="inline-block rounded-full px-4 py-1.5 text-xs font-bold tracking-wide"
            style={{ background: 'var(--pb-secondary-container)', color: 'var(--pb-on-secondary-container)' }}
          >
            {t('heroBadge')}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-black leading-tight tracking-tight sm:text-6xl"
              style={{ color: 'var(--pb-ink)' }}>
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed" style={{ color: 'var(--pb-muted)' }}>
            {t('heroSubtitle')}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="rounded-xl px-7 py-3.5 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
              style={{ background: 'var(--pb-primary)', boxShadow: '0 8px 24px rgba(0,53,197,.30)' }}
            >
              {t('heroCtaPrimary')}
            </Link>
            <Link
              href="/documentation"
              className="rounded-xl border px-7 py-3.5 text-sm font-bold transition-colors hover:bg-white"
              style={{ borderColor: 'var(--pb-border)', color: 'var(--pb-ink)' }}
            >
              {t('heroCtaSecondary')}
            </Link>
          </div>
        </Reveal>

        {/* Dashboard preview card */}
        <Reveal delay={0.15}>
          <div
            className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-3xl border shadow-2xl"
            style={{ borderColor: 'var(--pb-border)', boxShadow: '0 24px 80px rgba(0,53,197,.12)' }}
          >
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ background: 'var(--pb-soft-high)', borderColor: 'var(--pb-border)' }}>
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="mx-auto rounded-md bg-white px-6 py-1 text-xs font-medium" style={{ color: 'var(--pb-muted)' }}>
                dashboard.paybrain.cg
              </span>
            </div>
            {/* Dashboard content mockup */}
            <div className="p-6" style={{ background: 'var(--pb-bg)' }}>
              {/* Stats row */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                {[
                  { label: 'Volume total', value: '485 000 XAF', trend: '+12%' },
                  { label: 'Transactions', value: '1 247', trend: '+8%' },
                  { label: 'Taux de succès', value: '97.4%', trend: '+0.4%' },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl p-4" style={{ background: 'var(--pb-surface)', boxShadow: '0 2px 8px rgba(0,53,197,.06)' }}>
                    <div className="text-xs font-semibold" style={{ color: 'var(--pb-muted)' }}>{s.label}</div>
                    <div className="mt-1 text-lg font-bold" style={{ color: 'var(--pb-ink)' }}>{s.value}</div>
                    <div className="mt-1 text-xs font-bold" style={{ color: 'var(--pb-secondary)' }}>{s.trend}</div>
                  </div>
                ))}
              </div>
              {/* Chart placeholder */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--pb-surface)' }}>
                <div className="mb-3 text-sm font-semibold" style={{ color: 'var(--pb-ink)' }}>Activité — 7 derniers jours</div>
                <div className="flex h-20 items-end gap-1.5">
                  {[35, 55, 48, 70, 62, 88, 74].map((h, i) => (
                    <div
                      key={i} className="flex-1 rounded-t-md transition-all"
                      style={{ height: `${h}%`, background: i === 5 ? 'var(--pb-primary)' : 'var(--pb-soft-high)' }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                    <span key={d} className="flex-1 text-center text-xs" style={{ color: 'var(--pb-muted)' }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── STATS BAND ── */}
      <section style={{ background: 'var(--pb-primary)' }} className="py-14">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-5 sm:grid-cols-4">
          {[
            { value: '2', unit: 'opérateurs', label: 'MTN + Airtel' },
            { value: '< 3s', unit: '', label: 'Délai moyen de confirmation' },
            { value: '99.9%', unit: '', label: 'Disponibilité SLA' },
            { value: 'XAF', unit: '+ USD', label: 'Devises supportées' },
          ].map((s) => (
            <Reveal key={s.label}>
              <div className="text-center">
                <div className="text-3xl font-black text-white">{s.value}<span className="ml-1 text-lg font-bold" style={{ color: 'rgba(255,255,255,.7)' }}>{s.unit}</span></div>
                <div className="mt-1 text-xs font-semibold" style={{ color: 'rgba(255,255,255,.65)' }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--pb-primary)' }}>
              {t('featuresSectionLabel')}
            </div>
            <h2 className="text-3xl font-black sm:text-4xl" style={{ color: 'var(--pb-ink)' }}>{t('featuresSectionTitle')}</h2>
          </div>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.07}>
              <div
                className="flex h-full flex-col gap-3 rounded-2xl border p-6 transition-shadow hover:shadow-md"
                style={{ background: 'var(--pb-surface)', borderColor: 'var(--pb-border)' }}
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                  style={{ background: 'var(--pb-soft)' }}
                >
                  {f.icon}
                </div>
                <div className="text-base font-bold" style={{ color: 'var(--pb-ink)' }}>{f.title}</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--pb-muted)' }}>{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── ACCOUNT TYPES ── */}
      <section className="py-20" style={{ background: 'var(--pb-soft)' }}>
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="mb-12 text-center">
              <div className="mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--pb-primary)' }}>
                {t('accountsSectionLabel')}
              </div>
              <h2 className="text-3xl font-black sm:text-4xl" style={{ color: 'var(--pb-ink)' }}>{t('accountsSectionTitle')}</h2>
              <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: 'var(--pb-muted)' }}>{t('accountsSectionSubtitle')}</p>
            </div>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Compte commerçant */}
            <Reveal delay={0}>
              <div
                className="flex flex-col gap-5 rounded-3xl border-2 p-8"
                style={{ background: 'var(--pb-surface)', borderColor: 'var(--pb-primary)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                       style={{ background: 'var(--pb-soft-high)' }}>🏪</div>
                  <div>
                    <div className="text-lg font-black" style={{ color: 'var(--pb-ink)' }}>{t('merchantTitle')}</div>
                    <div
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{ background: 'var(--pb-soft-high)', color: 'var(--pb-primary)' }}
                    >
                      {t('merchantBadge')}
                    </div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--pb-muted)' }}>{t('merchantDesc')}</p>
                <ul className="flex flex-col gap-2">
                  {[t('merchantF1'), t('merchantF2'), t('merchantF3'), t('merchantF4')].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--pb-ink-var)' }}>
                      <span className="mt-0.5 font-bold" style={{ color: 'var(--pb-secondary)' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="mt-auto rounded-xl py-3 text-center text-sm font-bold text-white"
                  style={{ background: 'var(--pb-primary)' }}
                >
                  {t('merchantCta')}
                </Link>
              </div>
            </Reveal>

            {/* Compte normal */}
            <Reveal delay={0.08}>
              <div
                className="flex flex-col gap-5 rounded-3xl border-2 p-8"
                style={{ background: 'var(--pb-surface)', borderColor: 'var(--pb-border)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                       style={{ background: 'var(--pb-soft)' }}>👤</div>
                  <div>
                    <div className="text-lg font-black" style={{ color: 'var(--pb-ink)' }}>{t('clientTitle')}</div>
                    <div
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{ background: 'var(--pb-secondary-container)', color: 'var(--pb-on-secondary-container)' }}
                    >
                      {t('clientBadge')}
                    </div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--pb-muted)' }}>{t('clientDesc')}</p>
                <ul className="flex flex-col gap-2">
                  {[t('clientF1'), t('clientF2'), t('clientF3'), t('clientF4')].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--pb-ink-var)' }}>
                      <span className="mt-0.5 font-bold" style={{ color: 'var(--pb-secondary)' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="mt-auto rounded-xl border-2 py-3 text-center text-sm font-bold"
                  style={{ borderColor: 'var(--pb-primary)', color: 'var(--pb-primary)' }}
                >
                  {t('clientCta')}
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--pb-primary)' }}>
              {t('howSectionLabel')}
            </div>
            <h2 className="text-3xl font-black sm:text-4xl" style={{ color: 'var(--pb-ink)' }}>{t('howSectionTitle')}</h2>
          </div>
        </Reveal>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="relative flex flex-col gap-4">
                {i < steps.length - 1 && (
                  <div className="absolute left-8 top-8 hidden h-px w-full border-t-2 border-dashed sm:block"
                       style={{ borderColor: 'var(--pb-border)' }} />
                )}
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black"
                  style={{ background: 'var(--pb-soft-high)', color: 'var(--pb-primary)' }}
                >
                  {s.n}
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--pb-ink)' }}>{s.title}</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--pb-muted)' }}>{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── DEV SECTION ── */}
      <section style={{ background: 'var(--pb-primary)' }} className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <div className="mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.6)' }}>
                {t('devSectionLabel')}
              </div>
              <h2 className="text-3xl font-black text-white sm:text-4xl">{t('devSectionTitle')}</h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: 'rgba(255,255,255,.75)' }}>{t('devSectionText')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/documentation"
                  className="rounded-xl px-6 py-3 text-sm font-bold"
                  style={{ background: 'var(--pb-secondary-container)', color: 'var(--pb-on-secondary-container)' }}
                >
                  {t('devCtaPrimary')}
                </Link>
                <Link
                  href="/contact"
                  className="rounded-xl border px-6 py-3 text-sm font-bold text-white"
                  style={{ borderColor: 'rgba(255,255,255,.3)' }}
                >
                  {t('devCtaSecondary')}
                </Link>
              </div>
            </Reveal>

            {/* Code snippet */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl p-5 font-mono text-sm" style={{ background: 'var(--pb-primary-dark)' }}>
                <div className="mb-3 flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <pre className="overflow-x-auto text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,.85)' }}>{`// Initier un paiement
const payment = await paybrain.payments.create({
  amount: 5000,
  currency: "XAF",
  operator: "MTN",
  phone: "+242065000000",
  description: "Achat tissu wax",
  externalId: "order_123",
});

// Résultat instantané
// { id: "pay_abc123", status: "PENDING",
//   redirectUrl: "https://pay.paybrain.cg/..." }`}</pre>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── TRUST / OPERATORS ── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="rounded-3xl p-10 text-center" style={{ background: 'var(--pb-soft)' }}>
            <h2 className="text-2xl font-black" style={{ color: 'var(--pb-ink)' }}>{t('trustTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base" style={{ color: 'var(--pb-muted)' }}>{t('trustText')}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
              {[
                { name: 'MTN MoMo', color: '#FFCB02', text: '#000' },
                { name: 'Airtel Money', color: '#FF0000', text: '#fff' },
              ].map((op) => (
                <div
                  key={op.name}
                  className="flex h-14 items-center rounded-2xl px-7 text-sm font-black"
                  style={{ background: op.color, color: op.text }}
                >
                  {op.name}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── WAITLIST ── */}
      <section className="mx-auto max-w-2xl px-5 pb-24">
        <WaitlistForm />
      </section>
    </>
  );
}
