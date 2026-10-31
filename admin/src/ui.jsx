import { t } from './i18n';

export function Card({ title, children, style }) {
  return (
    <div style={{ background: '#161b2e', border: '1px solid #232a40', borderRadius: 12, padding: 20, marginBottom: 20, ...style }}>
      {title && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{title}</div>}
      {children}
    </div>
  );
}

export function Button({ children, onClick, disabled, variant = 'primary', style }) {
  const variants = {
    primary: { background: '#5b7cfa', color: '#fff' },
    danger: { background: '#dc2626', color: '#fff' },
    ghost: { background: 'transparent', color: '#c4cce0', border: '1px solid #2c3450' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, ...variants[variant], ...style,
    }}>{children}</button>
  );
}

const STATUS_COLOR = {
  APPROVED: '#16a34a', SUCCESSFUL: '#16a34a', CONFIRMED: '#16a34a', SENT: '#16a34a', ACTIVE: '#16a34a',
  SUCCEEDED: '#16a34a', SUCCESS: '#16a34a', DELIVERED: '#16a34a', READ: '#16a34a', ok: '#16a34a',
  REJECTED: '#dc2626', FAILED: '#dc2626', SUSPENDED: '#dc2626', BLOCKED: '#dc2626', DISABLED: '#dc2626', DEAD: '#dc2626', REVOKED: '#dc2626', ko: '#dc2626',
  QUEUED: '#d97706', PROCESSING: '#d97706', INVITED: '#d97706',
  IN_REVIEW: '#d97706', PENDING_VALIDATION: '#d97706', SUBMITTED: '#d97706', PENDING: '#d97706', NEEDS_MORE: '#d97706', PENDING_VERIFICATION: '#d97706',
};

export function Badge({ value }) {
  const c = STATUS_COLOR[value] || '#7b86a3';
  return <span style={{ color: c, border: `1px solid ${c}`, borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{value}</span>;
}

export function Table({ columns, rows, empty = t('common.noResult'), renderRow }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>{columns.map((c) => (
            <th key={c} style={{ textAlign: 'left', fontSize: 11, color: '#7b86a3', padding: '8px 10px', borderBottom: '1px solid #232a40', letterSpacing: 1 }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: '#4a5371' }}>{empty}</td></tr>}
          {rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}

export const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #1c2236' };

export const muted = { color: '#7b86a3' };
export const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #2c3450', background: '#0f1320', color: '#e6e9f2', fontSize: 13 };

/** Onglets d'un écran : `tabs` = [{ key, label }]. */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #232a40', marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map((tab) => (
        <button key={tab.key} onClick={() => onChange(tab.key)} style={{
          background: 'transparent', border: 'none', borderBottom: `2px solid ${value === tab.key ? '#00B4D8' : 'transparent'}`,
          color: value === tab.key ? '#00B4D8' : '#c4cce0', padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>{tab.label}</button>
      ))}
    </div>
  );
}

/** Grille libellé / valeur des fiches. */
export function InfoGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 13, marginBottom: 14 }}>
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label}><span style={muted}>{label}</span> {value ?? '—'}</div>
      ))}
    </div>
  );
}

/** Retour d'une action : succès en vert, erreur en rouge. */
export function Notice({ msg }) {
  if (!msg) return null;
  return <div style={{ color: msg.error ? '#f87171' : '#4ade80', fontSize: 13, marginBottom: 10 }}>{msg.text}</div>;
}

export const when = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—');
