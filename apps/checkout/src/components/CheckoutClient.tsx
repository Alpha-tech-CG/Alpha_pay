'use client';

import { useRef, useState } from 'react';

type Phase = 'form' | 'paying' | 'success' | 'error';

/** Clé d'idempotence figée à la première tentative : un retry ne double pas le paiement. */
function genIdemKey(): string {
  return `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function CheckoutClient({
  paylinkId,
  merchantName,
  amountLabel,
  description,
}: {
  paylinkId: string;
  merchantName: string;
  amountLabel: string;
  description: string | null;
}) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(genIdemKey());

  const canPay = phone.trim().length >= 8 && pin.length >= 4 && phase !== 'paying';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPay) return;
    setPhase('paying');
    setError(null);
    try {
      const res = await fetch(`/api/pay/${paylinkId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), pin, idempotencyKey: idemKey.current }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setPhase('success');
      } else {
        setError(typeof body?.message === 'string' ? body.message : 'Paiement refusé. Vérifiez votre numéro et votre PIN.');
        setPhase('error');
      }
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
      setPhase('error');
    }
  };

  if (phase === 'success') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
        <div style={okIcon}>✓</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Paiement réussi</h1>
        <p style={{ fontSize: 14, color: 'var(--pb-muted)', margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--pb-ink)' }}>{amountLabel}</strong> réglés à {merchantName}.
          Vous pouvez fermer cette page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Récapitulatif marchand + montant */}
      <p style={label}>Paiement à</p>
      <p style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 16px', color: 'var(--pb-ink)' }}>{merchantName}</p>

      <div style={amountBox}>
        <span style={{ fontSize: 13, color: 'var(--pb-muted)', fontWeight: 600 }}>Montant</span>
        <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--pb-primary)', letterSpacing: '-0.01em' }}>
          {amountLabel}
        </span>
      </div>
      {description ? (
        <p style={{ fontSize: 13, color: 'var(--pb-muted)', margin: '0 0 20px' }}>{description}</p>
      ) : (
        <div style={{ height: 20 }} />
      )}

      <div style={payWithRow}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pb-ink)' }}>Payer avec</span>
        <span style={pbBadge}>PayBrain</span>
      </div>

      <label style={fieldLabel} htmlFor="phone">Numéro de téléphone</label>
      <input
        id="phone"
        style={input}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+242 06 000 0000"
        inputMode="tel"
        autoComplete="tel"
      />

      <label style={fieldLabel} htmlFor="pin">Code PIN</label>
      <input
        id="pin"
        style={input}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="••••"
        inputMode="numeric"
        type="password"
        maxLength={6}
        autoComplete="off"
      />

      {phase === 'error' && error ? (
        <div style={errorBox}>{error}</div>
      ) : null}

      <button type="submit" disabled={!canPay} style={{ ...payBtn, opacity: canPay ? 1 : 0.5 }}>
        {phase === 'paying' ? <span className="pb-spinner" aria-label="Paiement en cours" /> : `Payer ${amountLabel}`}
      </button>

      <p style={{ fontSize: 11, color: 'var(--pb-muted)', textAlign: 'center', margin: '12px 0 0' }}>
        Vous n'avez pas de compte PayBrain ? Téléchargez l'application pour en créer un.
      </p>
    </form>
  );
}

/* ── styles ── */
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--pb-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 };
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--pb-ink-var)', margin: '0 0 6px' };
const input: React.CSSProperties = {
  width: '100%', height: 50, borderRadius: 12, border: '1.5px solid var(--pb-border)',
  background: 'var(--pb-bg)', padding: '0 14px', fontSize: 15, color: 'var(--pb-ink)',
  marginBottom: 16, outline: 'none', fontFamily: 'inherit',
};
const amountBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  background: 'var(--pb-soft)', borderRadius: 14, padding: '14px 16px', marginBottom: 12,
};
const payWithRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderTop: '1px solid var(--pb-border)', paddingTop: 18, marginBottom: 16,
};
const pbBadge: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--pb-primary)',
  background: 'var(--pb-soft-high)', borderRadius: 9999, padding: '4px 10px',
};
const payBtn: React.CSSProperties = {
  height: 56, borderRadius: 12, border: 'none', background: 'var(--pb-primary)',
  color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4,
  fontFamily: 'inherit',
};
const errorBox: React.CSSProperties = {
  background: 'var(--pb-error-container)', color: 'var(--pb-error)',
  borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.4,
};
const okIcon: React.CSSProperties = {
  width: 72, height: 72, borderRadius: 9999, background: '#e6f9f3', color: 'var(--pb-secondary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700,
};
