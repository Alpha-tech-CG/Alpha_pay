import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useT } from '../i18n'
import { Card, Button, Field, Input } from '../ui'

const PROFILE_KEY = 'pb_merchant_profile'

// Le profil marchand est persisté localement pour le MVP. Quand l'API exposera
// un endpoint /merchants/me (hors périmètre ALP-134), brancher ici.
export default function Profile() {
  const { t: tr } = useT()
  const { user } = useUser()
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {} } catch { return {} }
  })
  const [saved, setSaved] = useState(false)

  const update = (k) => (e) => { setData((d) => ({ ...d, [k]: e.target.value })); setSaved(false) }
  const save = () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data))
    setSaved(true)
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>{tr('profile.title')}</h1>
      <Card>
        <Field label={tr('profile.legalName')}>
          <Input value={data.legalName || ''} onChange={update('legalName')} />
        </Field>
        <Field label={tr('profile.tradeName')}>
          <Input value={data.tradeName || ''} onChange={update('tradeName')} />
        </Field>
        <Field label={tr('profile.address')}>
          <Input value={data.address || ''} onChange={update('address')} />
        </Field>
        <Field label={tr('profile.contactName')}>
          <Input value={data.contactName || ''} onChange={update('contactName')} />
        </Field>
        <Field label={tr('profile.contactPhone')}>
          <Input value={data.contactPhone || ''} onChange={update('contactPhone')} />
        </Field>
        <Field label={tr('profile.contactEmail')}>
          <Input value={data.contactEmail || user?.primaryEmailAddress?.emailAddress || ''} onChange={update('contactEmail')} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Button onClick={save}>{tr('common.save')}</Button>
          {saved && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>{tr('profile.saved')} ✓</span>}
        </div>
      </Card>
    </div>
  )
}
