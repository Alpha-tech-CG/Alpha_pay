import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/routing';
import Reveal from '@/components/Reveal';
import { Browser, Phone } from '@/components/Frames';

// Page d'accueil : charte de l'app (marine, moutarde, bordeaux) et captures réelles
// de l'application mobile et du tableau de bord (public/screens).

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 flex-none" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="var(--ap-mustard-soft)" />
      <path d="M6 10.5l2.6 2.5L14 7.5" stroke="var(--ap-navy)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Label({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest ${light ? 'bg-white/10 text-[var(--ap-mustard)]' : 'bg-[var(--ap-mustard-soft)] text-[var(--ap-mustard-deep)]'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ap-mustard)]" aria-hidden />
      {children}
    </span>
  );
}

const ICONS = {
  scan: 'M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M7 12h10',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z M9 12l2 2 4-4',
  card: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M3 10h18 M7 15h4',
  send: 'M4 12l16-8-6 16-2-6-8-2z',
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('landing');

  const features = [
    { tag: t('f1Tag'), title: t('f1Title'), text: t('f1Text'), points: [t('f1a'), t('f1b'), t('f1c')], shots: [{ src: '/screens/app-merchant-home.webp', alt: t('altMerchant') }, { src: '/screens/app-merchant-card.webp', alt: t('altCard') }] },
    { tag: t('f2Tag'), title: t('f2Title'), text: t('f2Text'), points: [t('f2a'), t('f2b'), t('f2c')], shots: [{ src: '/screens/app-budget-setup.webp', alt: t('altBudget') }, { src: '/screens/app-personal-home.webp', alt: t('altPersonal') }] },
    { tag: t('f3Tag'), title: t('f3Title'), text: t('f3Text'), points: [t('f3a'), t('f3b'), t('f3c')], shots: [{ src: '/screens/app-welcome-savings.webp', alt: t('altSavings') }] },
  ];

  const steps = [
    { n: '01', title: t('step1Title'), text: t('step1Text') },
    { n: '02', title: t('step2Title'), text: t('step2Text') },
    { n: '03', title: t('step3Title'), text: t('step3Text') },
  ];

  const diffs = [
    { icon: ICONS.scan, title: t('d1Title'), text: t('d1Text'), tone: 'bg-[var(--ap-navy-soft)] text-[var(--ap-navy)]' },
    { icon: ICONS.shield, title: t('d2Title'), text: t('d2Text'), tone: 'bg-[#e3f2ea] text-[var(--ap-success)]' },
    { icon: ICONS.card, title: t('d3Title'), text: t('d3Text'), tone: 'bg-[var(--ap-burgundy-soft)] text-[var(--ap-burgundy)]' },
    { icon: ICONS.send, title: t('d4Title'), text: t('d4Text'), tone: 'bg-[var(--ap-mustard-soft)] text-[var(--ap-mustard-deep)]' },
  ];

  return (
    <>
      {/* ── Accroche ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-[var(--ap-mustard)]/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-[var(--ap-navy-3)]/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <Reveal>
            <Label>{t('badge')}</Label>
            <h1 className="mt-6 text-[2.6rem] font-bold leading-[1.08] tracking-tight text-[var(--ap-navy)] sm:text-6xl">
              {t('title1')} <span className="text-[var(--ap-mustard)]">{t('titleAccent')}</span> {t('title2')}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--ap-ink-soft)]">{t('subtitle')}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-full bg-[var(--ap-navy)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--ap-navy)]/20 transition-transform hover:-translate-y-0.5">
                {t('ctaPrimary')}
              </Link>
              <Link href="/developer" className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[var(--ap-navy)] ring-1 ring-[var(--ap-line)] transition-colors hover:bg-[var(--ap-navy-soft)]">
                {t('ctaSecondary')}
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-[var(--ap-ink-soft)]">
              {[t('proof1'), t('proof2'), t('proof3')].map((p) => (
                <li key={p} className="flex items-center gap-2"><Check />{p}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="relative mx-auto flex h-[560px] max-w-md justify-center sm:h-[600px]">
              <div className="absolute inset-x-6 bottom-6 top-16 rounded-[3rem] bg-[var(--ap-navy)]" aria-hidden />
              <div className="absolute inset-x-6 bottom-6 top-16 overflow-hidden rounded-[3rem]" aria-hidden>
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--ap-navy-3)]" />
                <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-[var(--ap-burgundy)]/60" />
              </div>
              <Phone src="/screens/app-personal-home.webp" alt={t('altPersonal')} priority className="absolute left-1/2 top-0 w-[62%] -translate-x-[78%] -rotate-3" />
              <Phone src="/screens/app-welcome-collect.webp" alt={t('altWelcome')} className="absolute left-1/2 top-14 w-[56%] translate-x-[-8%] rotate-3" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Moyens de paiement ── */}
      <section className="border-y border-[var(--ap-line)] bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-8 md:flex-row md:justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ap-muted)]">{t('railTitle')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-xl bg-[#FFCC00] px-4 py-2 text-sm font-bold text-black">MTN MoMo</span>
            <span className="rounded-xl bg-[#E11900] px-4 py-2 text-sm font-bold text-white">airtel money</span>
            <span className="rounded-xl bg-[var(--ap-navy)] px-4 py-2 text-sm font-bold italic text-white">VISA</span>
            <span className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[var(--ap-navy)] ring-1 ring-[var(--ap-line)]">Mastercard</span>
            <span className="rounded-xl bg-[var(--ap-mustard-soft)] px-4 py-2 text-sm font-bold text-[var(--ap-navy)]">@AlphaPay</span>
          </div>
        </div>
      </section>

      {/* ── Fonctionnalités, captures réelles ── */}
      <section id="fonctionnalites" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Label>{t('featuresLabel')}</Label>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-[var(--ap-navy)] sm:text-[2.6rem] sm:leading-tight">{t('featuresTitle')}</h2>
            <p className="mt-4 text-[var(--ap-muted)]">{t('featuresText')}</p>
          </div>
        </Reveal>
        <div className="mt-16 space-y-10">
          {features.map((f, i) => (
            <Reveal key={f.title}>
              <div className={`grid items-center gap-10 overflow-hidden rounded-[2rem] bg-white p-8 ring-1 ring-[var(--ap-line)] sm:p-12 lg:grid-cols-2 ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <span className="text-sm font-semibold text-[var(--ap-burgundy)]">{f.tag}</span>
                  <h3 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-[var(--ap-navy)]">{f.title}</h3>
                  <p className="mt-4 leading-relaxed text-[var(--ap-ink-soft)]">{f.text}</p>
                  <ul className="mt-6 space-y-3">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-3 text-[var(--ap-ink)]"><Check />{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="relative flex min-h-[420px] items-end justify-center rounded-[1.6rem] bg-[var(--ap-bg)] px-6 pt-10">
                  <div className="absolute inset-x-10 top-6 h-40 rounded-full bg-[var(--ap-mustard)]/20 blur-2xl" aria-hidden />
                  {f.shots.map((sh, k) => (
                    <Phone key={sh.src} src={sh.src} alt={sh.alt} className={`relative -mb-24 w-[46%] max-w-[230px] ${f.shots.length > 1 ? (k === 0 ? '-mr-6 -rotate-2' : 'mt-12 rotate-2') : ''}`} />
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Trois étapes ── */}
      <section id="etapes" className="scroll-mt-24 bg-[var(--ap-navy)] py-24 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="max-w-2xl">
              <Label light>{t('stepsLabel')}</Label>
              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-[2.6rem]">{t('stepsTitle')}</h2>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div className="h-full rounded-3xl bg-white/[0.06] p-8 ring-1 ring-white/10">
                  <span className="text-5xl font-bold text-[var(--ap-mustard)]">{s.n}</span>
                  <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-3 leading-relaxed text-white/65">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── La différence ── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Label>{t('diffLabel')}</Label>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-[var(--ap-navy)] sm:text-[2.6rem]">{t('diffTitle')}</h2>
          </div>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {diffs.map((d, i) => (
            <Reveal key={d.title} delay={i * 0.06}>
              <div className="h-full rounded-3xl bg-white p-7 ring-1 ring-[var(--ap-line)] transition-transform hover:-translate-y-1">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${d.tone}`}><Icon d={d.icon} /></span>
                <h3 className="mt-5 text-lg font-semibold text-[var(--ap-navy)]">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ap-ink-soft)]">{d.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Tableau de bord web ── */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Label>{t('dashLabel')}</Label>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-[var(--ap-navy)] sm:text-[2.6rem]">{t('dashTitle')}</h2>
              <p className="mt-4 leading-relaxed text-[var(--ap-ink-soft)]">{t('dashText')}</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <Browser src="/screens/web-dashboard.webp" alt={t('altDash')} url="app.alphapay.cg" className="mx-auto mt-14 max-w-5xl" />
          </Reveal>
        </div>
      </section>

      {/* ── Développeurs ── */}
      <section className="relative overflow-hidden bg-[var(--ap-navy)] py-24 text-white">
        <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-[var(--ap-navy-3)]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-[var(--ap-burgundy)]/40 blur-2xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <Label light>{t('devLabel')}</Label>
            <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">{t('devTitle')}</h2>
            <p className="mt-5 leading-relaxed text-white/70">{t('devText')}</p>
            <ul className="mt-6 space-y-3">
              {[t('devA'), t('devB'), t('devC')].map((p) => (
                <li key={p} className="flex gap-3"><Check />{p}</li>
              ))}
            </ul>
            <pre className="mt-8 overflow-x-auto rounded-2xl bg-black/30 p-5 text-[13px] leading-relaxed ring-1 ring-white/10">
              <code>
                <span className="text-[var(--ap-mustard)]">curl</span> https://api.alphapay.cg/v1/payments \{'\n'}
                {'  '}-H <span className="text-[#9fd4b7]">&quot;Authorization: Bearer ap_test_…&quot;</span> \{'\n'}
                {'  '}-H <span className="text-[#9fd4b7]">&quot;Idempotency-Key: cmd-1042&quot;</span> \{'\n'}
                {'  '}-d <span className="text-[#9fd4b7]">&apos;{'{'}&quot;amount&quot;: 15000, &quot;phone&quot;: &quot;+242061234567&quot;{'}'}&apos;</span>
              </code>
            </pre>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/developer" className="rounded-full bg-[var(--ap-mustard)] px-6 py-3 text-sm font-semibold text-[var(--ap-navy)] transition-transform hover:-translate-y-0.5">{t('devCta')}</Link>
              <Link href="/documentation" className="rounded-full px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">{t('devDocs')}</Link>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="relative">
              <Browser src="/screens/web-developers.webp" alt={t('altDev')} url="app.alphapay.cg/developers" />
              <Browser src="/screens/web-api-docs.webp" alt={t('altDocs')} url="api.alphapay.cg/docs" className="absolute -bottom-16 -left-6 hidden w-[62%] md:block" />
            </div>
          </Reveal>
        </div>
        <div className="h-10 md:h-16" aria-hidden />
      </section>

      {/* ── Dernier appel ── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.4rem] bg-[var(--ap-mustard)] px-8 py-16 text-center sm:px-16">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/25" aria-hidden />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[var(--ap-burgundy)]/25" aria-hidden />
            <h2 className="relative text-3xl font-bold tracking-tight text-[var(--ap-navy)] sm:text-5xl">{t('finalTitle')}</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg text-[var(--ap-navy)]/80">{t('finalText')}</p>
            <div className="relative mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/contact" className="rounded-full bg-[var(--ap-navy)] px-7 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5">{t('finalCta')}</Link>
              <Link href="/contact" className="rounded-full bg-white/70 px-7 py-3.5 text-sm font-semibold text-[var(--ap-navy)] hover:bg-white">{t('finalSecondary')}</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
