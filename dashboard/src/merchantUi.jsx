import { useTheme } from './theme'
import { useT } from './i18n'

const STATUS_COLORS = {
  réussi: '#16a34a', payée: '#16a34a', payé: '#16a34a', rapproché: '#16a34a', reconciled: '#16a34a', done: '#16a34a',
  en_attente: '#d97706', envoyée: '#2563eb', partiellement_payée: '#d97706', pending: '#d97706', processing: '#2563eb',
  échoué: '#dc2626', en_retard: '#dc2626', écart: '#dc2626', discrepancy: '#dc2626', failed: '#dc2626',
  expiré: '#64748b', annulé: '#64748b', annulée: '#64748b', brouillon: '#64748b',
}

export function Pill({ status, label }) {
  const c = STATUS_COLORS[status] ?? '#64748b'
  return (
    <span style={{ color: c, background: `${c}1f`, borderRadius: 9999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {label ?? status}
    </span>
  )
}

/** Bascule test/live (affichée seulement quand le live est ouvert). */
export function ModeSwitch({ mode, setMode, canLive }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  if (!canLive) {
    return <span style={{ fontSize: 12, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 9999, padding: '4px 10px' }}>{tr('mode.test')}</span>
  }
  return (
    <div role="group" aria-label={tr('mode.label')} style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 9999, overflow: 'hidden' }}>
      {['live', 'test'].map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          style={{ border: 'none', padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: mode === m ? t.primary : 'transparent', color: mode === m ? t.primaryText : t.textMuted }}
        >
          {tr(`mode.${m}`)}
        </button>
      ))}
    </div>
  )
}

/** En-tête de page : titre, sous-titre, actions à droite. */
export function PageHeader({ title, intro, children }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{title}</h1>
        {intro && <p style={{ fontSize: 14, color: t.textMuted, margin: 0 }}>{intro}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

/** Onglets simples, utilisables au doigt. */
export function Tabs({ tabs, value, onChange }) {
  const { t } = useTheme()
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${t.border}`, marginBottom: 16, overflowX: 'auto' }}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          style={{
            border: 'none', background: 'transparent', padding: '10px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            color: value === tab.value ? t.primary : t.textMuted,
            borderBottom: `2px solid ${value === tab.value ? t.primary : 'transparent'}`,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** Indicateur chiffré. */
export function Stat({ label, value, hint, color }) {
  const { t } = useTheme()
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? t.text, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function StatGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>{children}</div>
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div role="alert" style={{ color: '#dc2626', background: '#FEE2E2', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 }}>{error}</div>
}

export function Empty({ children }) {
  const { t } = useTheme()
  return <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 14, padding: '28px 12px' }}>{children}</div>
}

/** Ligne de liste cliquable (mobile d'abord : pas de tableau horizontal). */
export function ListRow({ onClick, children }) {
  const { t } = useTheme()
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 4px',
        border: 'none', borderTop: `1px solid ${t.border}`, background: 'transparent', color: t.text, cursor: onClick ? 'pointer' : 'default', flexWrap: 'wrap',
      }}
    >
      {children}
    </Tag>
  )
}

/** Panneau latéral (détail), plein écran sur téléphone. */
export function Drawer({ open, onClose, title, children }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <aside
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', height: '100%', overflowY: 'auto', background: t.bg, color: t.text, padding: '20px 18px 40px', boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={tr('common.close')} style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            {tr('common.close')}
          </button>
        </div>
        {children}
      </aside>
    </div>
  )
}

