import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input, Select } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { dateTime, fmt, isLocked, money, todayBzv, useMerchant } from '../merchant'
import { Drawer, Empty, ErrorBox, ListRow, ModeSwitch, PageHeader, Pill, Stat, StatGrid } from '../merchantUi'
import { Exports } from './Payments'
import Locked from './Locked'

const DAY_STATUS = { pending: 'non_rapproché', reconciled: 'rapproché', discrepancy: 'écart' }

/**
 * Rapprochement journalier (§M6) : par caisse, total MTN, total Airtel et cash
 * déclaré ; statut rapproché / écart avec commentaire ; import facultatif du
 * relevé opérateur. Le caissier déclare son cash (sa caisse seulement).
 */
export default function Reconciliation() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode, setMode, canLive, can } = useMerchant()
  const [date, setDate] = useState(todayBzv())
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(false)
  const [selected, setSelected] = useState(null)
  const viewer = can('reconciliation:view')

  const load = useCallback(async () => {
    if (!base || !viewer) return
    try {
      const res = await authApi.get(`${base}/reconciliation/${date}/tills`, { params: { mode } })
      setRows(res.data.data)
      setError(null)
      setLocked(false)
    } catch (err) {
      if (isLocked(err)) setLocked(true)
      else setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, date, mode, viewer, tr])

  useEffect(() => {
    load()
  }, [load])

  const total = rows?.find((r) => r.till_id === null)

  return (
    <div>
      <PageHeader title={tr('recon.title')} intro={tr('recon.intro')}>
        <Input type="date" value={date} max={todayBzv()} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        <ModeSwitch mode={mode} setMode={setMode} canLive={canLive} />
      </PageHeader>
      <ErrorBox error={error} />
      {locked && <Locked module={tr('module.m6_manage')} />}

      {viewer && total && (
        <StatGrid>
          <Stat label="MTN MoMo" value={total.mtn_amount_display} />
          <Stat label="Airtel Money" value={total.airtel_amount_display} />
          <Stat label={tr('recon.cash')} value={total.cash_amount_display} />
          <Stat label={tr('recon.total')} value={money(total.mtn_amount + total.airtel_amount + total.cash_amount)} hint={fmt(tr('payments.stat.count'), { n: total.payments_count })} />
        </StatGrid>
      )}

      {viewer && !locked && (
        <Card style={{ padding: '6px 18px 14px', marginBottom: 16 }}>
          {!rows && !error && <Empty>{tr('common.loading')}</Empty>}
          {rows && rows.length === 0 && <Empty>{tr('recon.noTill')}</Empty>}
          {rows?.map((r) => (
            <ListRow key={r.till_id ?? 'all'} onClick={can('reconciliation:write') ? () => setSelected(r) : undefined}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: r.till_id ? 700 : 800, fontSize: 14 }}>{r.till_label}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>
                  MTN {r.mtn_amount_display} · Airtel {r.airtel_amount_display} · {tr('recon.cash')} {r.cash_amount_display}
                </div>
                {r.comment && <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic' }}>« {r.comment} »</div>}
              </div>
              <Pill status={DAY_STATUS[r.status]} label={tr(`recon.status.${r.status}`)} />
            </ListRow>
          ))}
        </Card>
      )}

      {can('cash:declare') && <CashEntries base={base} mode={mode} date={date} onChange={load} />}
      {can('exports:create') && !locked && <Exports base={base} mode={mode} filters={{ date_from: date, date_to: date }} kind="reconciliation" />}

      <DayDrawer base={base} mode={mode} date={date} day={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load() }} />
    </div>
  )
}

function DayDrawer({ base, mode, date, day, onClose, onSaved }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [status, setStatus] = useState('RECONCILED')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!day) return
    setStatus(day.status === 'discrepancy' ? 'DISCREPANCY' : 'RECONCILED')
    setComment(day.comment ?? '')
    setResult(null)
    setError(null)
    setFile(null)
  }, [day])

  if (!day) return null
  const params = { mode, ...(day.till_id ? { till_id: day.till_id } : {}) }

  const save = async () => {
    if (status === 'DISCREPANCY' && !comment.trim()) {
      setError(tr('recon.commentRequired'))
      return
    }
    setBusy(true)
    try {
      await authApi.patch(`${base}/reconciliation/${date}`, { status, comment: comment.trim() || undefined }, { params })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  const importStatement = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await authApi.post(`${base}/reconciliation/${date}/import-csv`, form, { params })
      setResult(res.data)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open onClose={onClose} title={`${day.till_label} · ${date}`}>
      <ErrorBox error={error} />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          MTN MoMo : <strong>{day.mtn_amount_display}</strong><br />
          Airtel Money : <strong>{day.airtel_amount_display}</strong><br />
          {tr('recon.cash')} : <strong>{day.cash_amount_display}</strong>
        </div>
      </Card>
      <Card style={{ marginBottom: 12 }}>
        <Field label={tr('recon.statusLabel')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="RECONCILED">{tr('recon.status.reconciled')}</option>
            <option value="DISCREPANCY">{tr('recon.status.discrepancy')}</option>
            <option value="PENDING">{tr('recon.status.pending')}</option>
          </Select>
        </Field>
        <Field label={tr('recon.comment')}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, padding: 10, fontSize: 13, fontFamily: 'inherit' }} />
        </Field>
        <Button disabled={busy} onClick={save}>{tr('common.save')}</Button>
      </Card>
      <Card>
        <strong style={{ fontSize: 14 }}>{tr('recon.statement')}</strong>
        <p style={{ fontSize: 12, color: t.textMuted }}>{tr('recon.statementIntro')}</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, marginBottom: 10, maxWidth: '100%' }} />
        <div><Button variant="ghost" disabled={!file || busy} onClick={importStatement}>{tr('recon.import')}</Button></div>
        {result && (
          <p style={{ fontSize: 13, marginBottom: 0 }}>
            {fmt(tr('recon.importResult'), { n: result.statement_parsed, amount: money(result.statement_amount ?? 0) })} <Pill status={DAY_STATUS[result.auto_status]} label={tr(`recon.status.${result.auto_status}`)} />
          </p>
        )}
      </Card>
    </Drawer>
  )
}

/** Cash déclaré (§M6) : saisie manuelle, marquée comme telle. */
function CashEntries({ base, mode, date, onChange }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { can } = useMerchant()
  const [tills, setTills] = useState([])
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState({ amount: '', till_id: '', note: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [tl, en] = await Promise.all([authApi.get(`${base}/tills/mine`), authApi.get(`${base}/cash-entries`, { params: { mode, date } })])
      setTills(tl.data.data)
      setEntries(en.data.data)
      setForm((f) => ({ ...f, till_id: f.till_id || tl.data.data[0]?.id || '' }))
    } catch (err) {
      if (!isLocked(err)) setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, mode, date, tr])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.post(`${base}/cash-entries`, { amount: Number(form.amount), till_id: form.till_id || undefined, note: form.note || undefined, entry_date: date }, { params: { mode } })
      setForm((f) => ({ ...f, amount: '', note: '' }))
      await load()
      onChange?.()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await authApi.delete(`${base}/cash-entries/${id}`)
      await load()
      onChange?.()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <strong style={{ fontSize: 15 }}>{tr('cash.title')}</strong>
      <p style={{ fontSize: 12, color: t.textMuted, margin: '4px 0 12px' }}>{tr('cash.intro')}</p>
      <ErrorBox error={error} />
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 12px', alignItems: 'end' }}>
        <Field label={tr('cash.amount')}><Input type="number" min="1" step="1" inputMode="numeric" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        {tills.length > 0 && (
          <Field label={tr('payments.filter.till')}>
            <Select value={form.till_id} onChange={(e) => setForm({ ...form, till_id: e.target.value })} required={!can('payments:view')}>
              {can('payments:view') && <option value="">{tr('cash.noTill')}</option>}
              {tills.map((x) => <option key={x.id} value={x.id}>{x.store?.name} · {x.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={tr('cash.note')}><Input value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <div style={{ marginBottom: 14 }}><Button type="submit" disabled={busy}>{tr('cash.declare')}</Button></div>
      </form>
      {entries.map((c) => (
        <ListRow key={c.id}>
          <strong style={{ flex: '0 0 auto', fontSize: 14 }}>{c.amount_display}</strong>
          <span style={{ flex: 1, fontSize: 12, color: t.textMuted, minWidth: 0 }}>
            {tr('cash.declared')} · {dateTime(c.created_at)}{c.note ? ` · ${c.note}` : ''}
          </span>
          <Button variant="ghost" onClick={() => remove(c.id)}>{tr('common.delete')}</Button>
        </ListRow>
      ))}
    </Card>
  )
}
