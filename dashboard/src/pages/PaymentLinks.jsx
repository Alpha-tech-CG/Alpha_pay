import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { dateTime, money, useMerchant } from '../merchant'
import { Empty, ErrorBox, ListRow, ModeSwitch, PageHeader, Pill } from '../merchantUi'

const STATE_COLOR = { actif: 'réussi', expiré: 'expiré', utilisé: 'payée', désactivé: 'annulé' }

/** Liens de paiement (§M4) : montant fixe ou libre, expiration, usage unique ou multiple, partage WhatsApp/SMS. */
export default function PaymentLinks() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode, setMode, canLive, can } = useMerchant()
  const [list, setList] = useState(null)
  const [form, setForm] = useState({ amount: '', description: '', expires_at: '', multi_use: false })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const writer = can('paylinks:write')

  const load = useCallback(async () => {
    if (!base) return
    try {
      const res = await authApi.get(`${base}/payment-links`, { params: { mode, limit: 50 } })
      setList(res.data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, mode, tr])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.post(
        `${base}/payment-links`,
        {
          description: form.description,
          ...(form.amount ? { amount: Number(form.amount) } : {}),
          ...(form.expires_at ? { expires_at: new Date(`${form.expires_at}T23:59:00+01:00`).toISOString() } : {}),
          multi_use: form.multi_use,
        },
        { params: { mode } },
      )
      setForm({ amount: '', description: '', expires_at: '', multi_use: false })
      await load()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  const deactivate = async (id) => {
    try {
      await authApi.post(`${base}/payment-links/${id}/deactivate`, {}, { params: { mode } })
      await load()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title={tr('links.title')} intro={tr('links.intro')}>
        <ModeSwitch mode={mode} setMode={setMode} canLive={canLive} />
      </PageHeader>
      <ErrorBox error={error} />
      {writer && (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0 12px', alignItems: 'end' }}>
            <Field label={tr('links.description')}><Input required maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={tr('links.placeholder')} /></Field>
            <Field label={tr('links.amount')}><Input type="number" min="1" step="1" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={tr('links.free')} /></Field>
            <Field label={tr('links.expires')}><Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 22 }}>
              <input type="checkbox" checked={form.multi_use} onChange={(e) => setForm({ ...form, multi_use: e.target.checked })} /> {tr('links.multi')}
            </label>
            <div style={{ marginBottom: 14 }}><Button type="submit" disabled={busy}>{tr('links.create')}</Button></div>
          </form>
        </Card>
      )}
      <Card style={{ padding: '6px 18px 14px' }}>
        {!list && !error && <Empty>{tr('common.loading')}</Empty>}
        {list?.data.length === 0 && <Empty>{tr('links.empty')}</Empty>}
        {list?.data.map((l) => (
          <ListRow key={l.id}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{l.description}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>
                {l.amount != null ? money(l.amount, l.currency) : tr('links.free')} · {l.multi_use ? tr('links.multi') : tr('links.single')} · {l.payments_succeeded} {tr('links.paid')}
                {l.expires_at ? ` · ${tr('links.until')} ${dateTime(l.expires_at)}` : ''}
              </div>
            </div>
            <Pill status={STATE_COLOR[l.state]} label={tr(`links.state.${l.state}`)} />
            {l.state === 'actif' && (
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(l.url)}>{tr('common.copy')}</Button>
                <a href={l.share.whatsapp} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: t.primary, padding: '10px 6px' }}>WhatsApp</a>
                <a href={l.share.sms} style={{ fontSize: 13, fontWeight: 700, color: t.primary, padding: '10px 6px' }}>SMS</a>
                {writer && <Button variant="ghost" onClick={() => deactivate(l.id)}>{tr('links.deactivate')}</Button>}
              </span>
            )}
          </ListRow>
        ))}
      </Card>
    </div>
  )
}
