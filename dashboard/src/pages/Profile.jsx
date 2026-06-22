import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Card, Button, Field, Input } from '../ui'

const PROFILE_KEY = 'pb_merchant_profile'

function SectionTitle({ children }) {
  const { t } = useTheme()
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: t.textMuted, textTransform: 'uppercase', margin: '24px 4px 10px' }}>{children}</div>
}

function SecurityRow({ icon, label, value, accent }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px', borderBottom: `1px solid ${t.border}` }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: t.surfaceAlt, display: 'grid', placeItems: 'center', fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent || t.textMuted }}>{value}</span>
    </div>
  )
}

// Le profil marchand est persisté localement pour le MVP. Quand l'API exposera
// un endpoint /merchants/me (hors périmètre ALP-134), brancher ici.
export default function Profile() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user } = useUser()
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {} } catch { return {} }
  })
  const [saved, setSaved] = useState(false)

  const update = (k) => (e) => { setData((d) => ({ ...d, [k]: e.target.value })); setSaved(false) }
  const save = () => { localStorage.setItem(PROFILE_KEY, JSON.stringify(data)); setSaved(true) }

  const email = user?.primaryEmailAddress?.emailAddress || ''
  const name = user?.fullName || data.contactName || 'Marchand'

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{tr('profile.title')}</h1>

      {/* Carte profil */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {user?.imageUrl
            ? <img src={user.imageUrl} alt="" style={{ width: 52, height: 52, borderRadius: '50%' }} />
            : <span style={{ width: 52, height: 52, borderRadius: '50%', background: t.primary, color: t.primaryText, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>{name.charAt(0).toUpperCase()}</span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 13, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          </div>
        </div>
      </Card>

      {/* Sécurité (gérée par Clerk via l'avatar en haut à droite) */}
      <SectionTitle>Sécurité</SectionTitle>
      <Card style={{ padding: '6px 24px' }}>
        <SecurityRow icon="🛡️" label="Double authentification (2FA)" value="Gérée via le compte" accent={t.primary} />
        <SecurityRow icon="👆" label="Connexion biométrique" value="Disponible" />
        <SecurityRow icon="🔑" label="Mot de passe" value="Modifier dans le compte" />
        <div style={{ padding: '12px 0 4px', fontSize: 12, color: t.textMuted }}>
          Ces réglages sont gérés via votre compte (icône en haut à droite).
        </div>
      </Card>

      {/* Profil marchand */}
      <SectionTitle>Profil marchand</SectionTitle>
      <Card>
        <Field label={tr('profile.legalName')}><Input value={data.legalName || ''} onChange={update('legalName')} /></Field>
        <Field label={tr('profile.tradeName')}><Input value={data.tradeName || ''} onChange={update('tradeName')} /></Field>
        <Field label={tr('profile.address')}><Input value={data.address || ''} onChange={update('address')} /></Field>
        <Field label={tr('profile.contactName')}><Input value={data.contactName || ''} onChange={update('contactName')} /></Field>
        <Field label={tr('profile.contactPhone')}><Input value={data.contactPhone || ''} onChange={update('contactPhone')} /></Field>
        <Field label={tr('profile.contactEmail')}><Input value={data.contactEmail || email} onChange={update('contactEmail')} /></Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Button onClick={save}>{tr('common.save')}</Button>
          {saved && <span style={{ color: t.primary, fontSize: 13, fontWeight: 600 }}>{tr('profile.saved')} ✓</span>}
        </div>
      </Card>
    </div>
  )
}
