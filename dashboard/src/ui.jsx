import { useTheme } from './theme'

export function Card({ children, style }) {
  const { t } = useTheme()
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '20px 24px', boxShadow: t.shadow, ...style,
    }}>{children}</div>
  )
}

export function Button({ children, variant = 'primary', disabled, type = 'button', onClick, style }) {
  const { t } = useTheme()
  const base = {
    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer', border: 'none', opacity: disabled ? 0.6 : 1,
    ...style,
  }
  const variants = {
    primary: { background: t.primary, color: t.primaryText },
    ghost: { background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}` },
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  )
}

export function Field({ label, children }) {
  const { t } = useTheme()
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 12, color: t.textMuted, marginBottom: 6, display: 'block' }}>{label}</span>
      {children}
    </label>
  )
}

export function Input(props) {
  const { t } = useTheme()
  return (
    <input {...props} style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8,
      padding: '10px 12px', color: t.text, fontSize: 13, width: '100%', boxSizing: 'border-box',
      ...props.style,
    }} />
  )
}

export function Select(props) {
  const { t } = useTheme()
  return (
    <select {...props} style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8,
      padding: '10px 12px', color: t.text, fontSize: 13, width: '100%', boxSizing: 'border-box',
      ...props.style,
    }}>{props.children}</select>
  )
}

export function Badge({ status }) {
  const { status: colors } = useTheme()
  const c = colors[status] || '#64748b'
  return (
    <span style={{
      color: c, border: `1px solid ${c}`, borderRadius: 6,
      padding: '2px 10px', fontSize: 12, fontWeight: 700,
    }}>{status}</span>
  )
}
