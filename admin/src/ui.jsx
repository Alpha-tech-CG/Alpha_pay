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
  REJECTED: '#dc2626', FAILED: '#dc2626', SUSPENDED: '#dc2626', BLOCKED: '#dc2626',
  IN_REVIEW: '#d97706', PENDING_VALIDATION: '#d97706', SUBMITTED: '#d97706', PENDING: '#d97706', NEEDS_MORE: '#d97706', PENDING_VERIFICATION: '#d97706',
};

export function Badge({ value }) {
  const c = STATUS_COLOR[value] || '#7b86a3';
  return <span style={{ color: c, border: `1px solid ${c}`, borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{value}</span>;
}

export function Table({ columns, rows, empty = 'Aucun résultat', renderRow }) {
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
