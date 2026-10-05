'use client';

import { useState, useRef } from 'react';

type State = 'idle' | 'busy' | 'ok' | 'err';

const field = 'w-full rounded-xl border border-[var(--pb-border)] bg-[var(--pb-bg)] px-4 py-3 text-sm text-[var(--pb-ink)] outline-none focus:border-[var(--pb-primary)] transition-colors';
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--pb-muted)]';

export default function DeveloperForm() {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', company: '', website: '', useCase: '',
  });
  const [idFile, setIdFile] = useState<File | null>(null);
  const [hp, setHp] = useState('');
  const [state, setState] = useState<State>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hp) return; // honeypot
    setState('busy');
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      data.append('accountType', 'DEVELOPER');
      if (idFile) data.append('idDocument', idFile);
      const res = await fetch('/api/onboarding/developer', { method: 'POST', body: data });
      setState(res.ok ? 'ok' : 'err');
    } catch {
      setState('err');
    }
  };

  if (state === 'ok') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
             style={{ background: 'var(--pb-soft-high)' }}>⏳</div>
        <h3 className="text-lg font-black" style={{ color: 'var(--pb-ink)' }}>Demande reçue !</h3>
        <p className="max-w-xs text-sm leading-relaxed" style={{ color: 'var(--pb-muted)' }}>
          Notre équipe examine votre dossier et vérifie votre pièce d'identité.
          Vous recevrez votre clé API par email sous <strong>48h ouvrées</strong>.
        </p>
        <div className="rounded-xl p-4 text-sm"
             style={{ background: 'var(--pb-soft)', color: 'var(--pb-muted)' }}>
          Vérifiez vos spams si vous ne recevez rien après 48h.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* Honeypot */}
      <input type="text" tabIndex={-1} autoComplete="off" value={hp}
             onChange={(e) => setHp(e.target.value)} className="hidden" aria-hidden="true" />

      {/* Identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Nom complet *</label>
          <input required value={form.fullName} onChange={upd('fullName')}
                 placeholder="Jean-Paul Kambou" className={field} />
        </div>
        <div>
          <label className={label}>Email professionnel *</label>
          <input required type="email" value={form.email} onChange={upd('email')}
                 placeholder="vous@email.com" className={field} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Téléphone *</label>
          <input required value={form.phone} onChange={upd('phone')}
                 placeholder="+242 065 000 000" className={field} />
        </div>
        <div>
          <label className={label}>Entreprise / Projet *</label>
          <input required value={form.company} onChange={upd('company')}
                 placeholder="Nom de votre projet" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Site web ou lien app <span className="normal-case font-normal">(optionnel)</span></label>
        <input value={form.website} onChange={upd('website')}
               placeholder="https://monapp.cg" className={field} />
      </div>

      {/* Use case */}
      <div>
        <label className={label}>Cas d'usage *</label>
        <select required value={form.useCase} onChange={upd('useCase')} className={field}
                style={{ appearance: 'none' }}>
          <option value="">Sélectionnez votre cas d'usage…</option>
          <option value="ecommerce">E-commerce / boutique en ligne</option>
          <option value="marketplace">Marketplace / place de marché</option>
          <option value="saas">Application SaaS</option>
          <option value="delivery">Livraison / logistique</option>
          <option value="education">Formation / éducation</option>
          <option value="other">Autre</option>
        </select>
      </div>

      {/* ID document upload */}
      <div>
        <label className={label}>Pièce d'identité *
          <span className="ml-1 normal-case font-normal">(CNI ou passeport)</span>
        </label>
        <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
               onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors hover:border-[var(--pb-primary)]"
                style={{ borderColor: idFile ? 'var(--pb-secondary)' : 'var(--pb-border)', background: idFile ? 'var(--pb-soft)' : 'transparent' }}>
          {idFile ? (
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg">✅</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--pb-secondary)' }}>
                {idFile.name}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-2xl">📎</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--pb-primary)' }}>
                Cliquez pour joindre votre document
              </span>
              <span className="text-xs" style={{ color: 'var(--pb-muted)' }}>
                JPG, PNG ou PDF · max 5 Mo
              </span>
            </div>
          )}
        </button>
      </div>

      {state === 'err' && (
        <p className="rounded-xl p-3 text-sm font-medium"
           style={{ background: 'var(--pb-soft)', color: 'var(--pb-primary)' }}>
          Une erreur est survenue, réessayez ou contactez support@alphapay.cg
        </p>
      )}

      <button
        type="submit"
        disabled={state === 'busy' || !idFile}
        className="h-13 w-full rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
        style={{ background: 'var(--pb-primary)', height: '52px' }}
      >
        {state === 'busy' ? 'Envoi en cours…' : "Envoyer ma demande d'accès"}
      </button>

      <p className="text-center text-xs" style={{ color: 'var(--pb-muted)' }}>
        🔒 Vos données sont chiffrées et traitées conformément à notre{' '}
        <a href="/confidentialite" className="underline" style={{ color: 'var(--pb-primary)' }}>
          politique de confidentialité
        </a>.
      </p>
    </form>
  );
}
