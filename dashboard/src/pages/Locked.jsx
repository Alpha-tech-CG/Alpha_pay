import { Link } from 'react-router-dom'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { fmt } from '../merchant'

/** Module visible mais verrouillé par le palier (§M11), avec invitation à en changer. */
export default function Locked({ module }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  return (
    <div role="status" style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🔒 {fmt(tr('locked.title'), { module })}</div>
      <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 8 }}>{tr('locked.text')}</div>
      <Link to="/billing" style={{ color: t.primary, fontWeight: 700, fontSize: 14 }}>{tr('locked.cta')} →</Link>
    </div>
  )
}
