'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function ContactForm() {
  const t = useTranslations('contact');
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [hp, setHp] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company: hp }),
      });
      setState(res.ok ? 'ok' : 'err');
      if (res.ok) setForm({ name: '', email: '', message: '' });
    } catch {
      setState('err');
    }
  };

  const field = 'w-full rounded-lg border border-[var(--pb-border)] px-4 py-3 text-sm outline-none focus:border-[var(--pb-primary)]';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hidden" aria-hidden="true" />
      <label className="text-sm font-medium">
        {t('name')}
        <input required value={form.name} onChange={upd('name')} className={`mt-1 ${field}`} />
      </label>
      <label className="text-sm font-medium">
        {t('email')}
        <input type="email" required value={form.email} onChange={upd('email')} className={`mt-1 ${field}`} />
      </label>
      <label className="text-sm font-medium">
        {t('message')}
        <textarea required rows={5} value={form.message} onChange={upd('message')} className={`mt-1 ${field}`} />
      </label>
      <button type="submit" disabled={state === 'busy'} className="self-start rounded-lg px-6 py-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--pb-primary)' }}>
        {state === 'busy' ? t('sending') : t('send')}
      </button>
      {state === 'ok' && <p className="text-sm font-medium text-green-600">{t('success')}</p>}
      {state === 'err' && <p className="text-sm font-medium text-red-600">{t('error')}</p>}
    </form>
  );
}
