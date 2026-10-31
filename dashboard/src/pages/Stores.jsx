import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input, Select } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { download, useMerchant } from '../merchant'
import { Empty, ErrorBox, PageHeader, Pill } from '../merchantUi'

/**
 * Boutiques et caisses (§M6) : marchand → boutiques → caisses ; caissiers
 * rattachés ; QR de caisse imprimable en A5/A6 ; confirmations Vérif par SMS
 * ou WhatsApp, réglables par caisse. Réservé au propriétaire et aux
 * administrateurs (le serveur revérifie).
 */
export default function Stores() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, can } = useMerchant()
  const [stores, setStores] = useState(null)
  const [cashiers, setCashiers] = useState([])
  const [error, setError] = useState(null)
  const [newStore, setNewStore] = useState({ name: '', address: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!base) return
    try {
      const [s, m] = await Promise.all([authApi.get(`${base}/stores`), authApi.get(`${base}/members`)])
      setStores(s.data.data)
      const members = Array.isArray(m.data) ? m.data : (m.data.data ?? [])
      setCashiers(members.filter((x) => x.role === 'CASHIER' && x.status === 'ACTIVE'))
      setError(null)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, tr])

  useEffect(() => {
    load()
  }, [load])

  const act = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  if (!can('stores:manage')) return <Empty>{tr('common.forbidden')}</Empty>

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title={tr('stores.title')} intro={tr('stores.intro')} />
      <ErrorBox error={error} />

      <Card style={{ marginBottom: 16 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            act(async () => {
              await authApi.post(`${base}/stores`, { name: newStore.name, address: newStore.address || undefined })
              setNewStore({ name: '', address: '' })
            })
          }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px', alignItems: 'end' }}
        >
          <Field label={tr('stores.name')}><Input required maxLength={120} value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} placeholder={tr('stores.placeholder')} /></Field>
          <Field label={tr('stores.address')}><Input maxLength={250} value={newStore.address} onChange={(e) => setNewStore({ ...newStore, address: e.target.value })} /></Field>
          <div style={{ marginBottom: 14 }}><Button type="submit" disabled={busy}>{tr('stores.add')}</Button></div>
        </form>
      </Card>

      {!stores && !error && <Empty>{tr('common.loading')}</Empty>}
      {stores?.length === 0 && <Empty>{tr('stores.empty')}</Empty>}
      {stores?.map((s) => (
        <StoreCard key={s.id} store={s} base={base} cashiers={cashiers} busy={busy} act={act} />
      ))}
      <p style={{ fontSize: 12, color: t.textMuted }}>{tr('stores.limitHint')}</p>
    </div>
  )
}

function StoreCard({ store, base, cashiers, busy, act }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [tillName, setTillName] = useState('')

  return (
    <Card style={{ marginBottom: 16, opacity: store.active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 16 }}>{store.name}</strong>
          {store.address && <div style={{ fontSize: 12, color: t.textMuted }}>{store.address}</div>}
        </div>
        {!store.active && <Pill status="annulé" label={tr('stores.inactive')} />}
        <Button variant="ghost" disabled={busy} onClick={() => act(() => authApi.patch(`${base}/stores/${store.id}`, { active: !store.active }))}>
          {store.active ? tr('stores.deactivate') : tr('stores.reactivate')}
        </Button>
      </div>

      {store.tills.map((till) => (
        <TillRow key={till.id} till={till} base={base} cashiers={cashiers} busy={busy} act={act} />
      ))}

      {store.active && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            act(async () => {
              await authApi.post(`${base}/stores/${store.id}/tills`, { name: tillName })
              setTillName('')
            })
          }}
          style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
        >
          <Input required maxLength={80} value={tillName} onChange={(e) => setTillName(e.target.value)} placeholder={tr('stores.tillPlaceholder')} style={{ flex: '1 1 180px', width: 'auto' }} />
          <Button type="submit" variant="ghost" disabled={busy}>{tr('stores.addTill')}</Button>
        </form>
      )}
    </Card>
  )
}

function TillRow({ till, base, cashiers, busy, act }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [assign, setAssign] = useState('')
  const assigned = new Set(till.members.map((m) => m.memberId))
  const available = cashiers.filter((c) => !assigned.has(c.id))
  const toggle = (key) => act(() => authApi.patch(`${base}/tills/${till.id}`, { [key]: !till[key] }))
  const checkbox = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }

  return (
    <div style={{ borderTop: `1px solid ${t.border}`, padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14, flex: '1 1 140px' }}>{till.name}</strong>
        <code style={{ fontSize: 12, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{till.publicCode}</code>
        {!till.active && <Pill status="annulé" label={tr('stores.inactive')} />}
        <Button variant="ghost" onClick={() => download(`${base}/tills/${till.id}/qr.pdf`, `qr-${till.publicCode}-A6.pdf`, { format: 'A6' })}>QR A6</Button>
        <Button variant="ghost" onClick={() => download(`${base}/tills/${till.id}/qr.pdf`, `qr-${till.publicCode}-A5.pdf`, { format: 'A5' })}>QR A5</Button>
        <Button variant="ghost" disabled={busy} onClick={() => toggle('active')}>{till.active ? tr('stores.deactivate') : tr('stores.reactivate')}</Button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0', color: t.textMuted }}>
        <span style={{ fontSize: 13 }}>{tr('stores.verif')}</span>
        <label style={checkbox}><input type="checkbox" checked={till.confirmBySms} disabled={busy} onChange={() => toggle('confirmBySms')} /> SMS</label>
        <label style={checkbox}><input type="checkbox" checked={till.confirmByWhatsApp} disabled={busy} onChange={() => toggle('confirmByWhatsApp')} /> WhatsApp</label>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {till.members.length === 0 && <span style={{ fontSize: 12, color: t.textMuted }}>{tr('stores.noCashier')}</span>}
        {till.members.map((m) => (
          <span key={m.memberId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: t.surfaceAlt, borderRadius: 9999, padding: '4px 6px 4px 12px', fontSize: 13 }}>
            {m.fullName ?? m.phone}
            <button type="button" aria-label={tr('stores.unassign')} disabled={busy} onClick={() => act(() => authApi.delete(`${base}/tills/${till.id}/members/${m.memberId}`))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.textMuted, fontSize: 14 }}>×</button>
          </span>
        ))}
        {available.length > 0 && (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <Select value={assign} onChange={(e) => setAssign(e.target.value)} style={{ width: 'auto', padding: '6px 10px' }}>
              <option value="">{tr('stores.assign')}</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.fullName ?? c.email}</option>)}
            </Select>
            <Button variant="ghost" disabled={!assign || busy} onClick={() => act(async () => { await authApi.post(`${base}/tills/${till.id}/members`, { memberId: assign }); setAssign('') })}>OK</Button>
          </span>
        )}
      </div>
    </div>
  )
}
