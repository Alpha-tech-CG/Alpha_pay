'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function WaitlistForm() {
  const t = useTranslations('waitlist');
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState(''); // honeypot anti-spam
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company: hp }),
      });
      setState(res.ok ? 'ok' : 'err');
      if (res.ok) setEmail('');
    } catch {
      setState('err');
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--pb-border)] bg-white p-6 shadow-sm">
      <div className="text-lg font-bold">{t('title')}</div>
      <p className="mt-1 text-sm text-[var(--pb-muted)]">{t('subtitle')}</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        {/* Honeypot : caché aux humains, rempli par les bots */}
        <input
          type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)}
          className="hidden" aria-hidden="true"
        />
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t('placeholder')}
          className="flex-1 rounded-lg border border-[var(--pb-border)] px-4 py-3 text-sm outline-none focus:border-[var(--pb-primary)]"
        />
        <button
          type="submit" disabled={state === 'busy'}
          className="rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--pb-primary)' }}
        >
          {state === 'busy' ? t('joining') : t('join')}
        </button>
      </form>
      {state === 'ok' && <p className="mt-3 text-sm font-medium text-green-600">{t('success')}</p>}
      {state === 'err' && <p className="mt-3 text-sm font-medium text-red-600">{t('error')}</p>}
    </div>
  );
}
