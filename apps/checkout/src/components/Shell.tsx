import React from 'react';

/** Enveloppe visuelle commune : logo PayBrain, carte centrée, mention de sécurité. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        gap: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--pb-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 900,
            fontSize: 20,
          }}
        >
          P
        </div>
        <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--pb-ink)', letterSpacing: '-0.02em' }}>
          PayBrain
        </span>
      </div>

      <main
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--pb-surface)',
          borderRadius: 24,
          padding: 28,
          boxShadow: '0 8px 28px rgba(0, 53, 197, 0.08)',
          border: '1px solid var(--pb-border)',
        }}
      >
        {children}
      </main>

      <p style={{ fontSize: 12, color: 'var(--pb-muted)', margin: 0, textAlign: 'center' }}>
        🔒 Paiement sécurisé — vos identifiants ne quittent jamais PayBrain en clair.
      </p>
    </div>
  );
}

const TONES: Record<string, { bg: string; fg: string }> = {
  success: { bg: '#e6f9f3', fg: 'var(--pb-secondary)' },
  error: { bg: 'var(--pb-error-container)', fg: 'var(--pb-error)' },
  muted: { bg: 'var(--pb-soft-high)', fg: 'var(--pb-ink-var)' },
};

/** Écran d'état terminal (introuvable / expiré / déjà réglé / succès). */
export function StatusCard({
  icon,
  tone,
  title,
  text,
}: {
  icon: string;
  tone: 'success' | 'error' | 'muted';
  title: string;
  text: string;
}) {
  const t = TONES[tone];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 9999,
          background: t.bg,
          color: t.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 34,
          fontWeight: 700,
        }}
      >
        {icon}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--pb-ink)', margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 14, color: 'var(--pb-muted)', margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}
