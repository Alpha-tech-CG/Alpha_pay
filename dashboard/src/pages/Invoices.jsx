import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input, Select } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { day, dateTime, fmt, isLocked, money, openPdf, useMerchant } from '../merchant'
import { Drawer, Empty, ErrorBox, ListRow, ModeSwitch, PageHeader, Pill, Stat, StatGrid, Tabs } from '../merchantUi'
import Locked from './Locked'

const STATUSES = ['brouillon', 'envoyée', 'partiellement_payée', 'payée', 'en_retard', 'annulée']
const CHANNELS = ['whatsapp', 'sms', 'email']

/**
 * Recouvrer (§M7) : factures avec lien de paiement intégré, échéanciers,
 * relances automatiques, reçus, clients. Lecture : propriétaire,
 * administrateur, comptable ; écriture : propriétaire et administrateur.
 */
export default function Invoices() {
  const { t: tr } = useT()
  const ctx = useMerchant()
  const [tab, setTab] = useState('invoices')
  const [locked, setLocked] = useState(false)

  if (!ctx.can('invoices:view')) return <Empty>{tr('common.forbidden')}</Empty>

  return (
    <div>
      <PageHeader title={tr('inv.title')} intro={tr('inv.intro')}>
        <ModeSwitch mode={ctx.mode} setMode={ctx.setMode} canLive={ctx.canLive} />
      </PageHeader>
      {locked ? (
        <Locked module={tr('module.m7_recover')} />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'invoices', label: tr('inv.tab.invoices') },
              { value: 'customers', label: tr('inv.tab.customers') },
              { value: 'receipts', label: tr('inv.tab.receipts') },
              { value: 'settings', label: tr('inv.tab.settings') },
            ]}
          />
          {tab === 'invoices' && <InvoiceList ctx={ctx} onLocked={() => setLocked(true)} />}
          {tab === 'customers' && <Customers ctx={ctx} />}
          {tab === 'receipts' && <Receipts ctx={ctx} />}
          {tab === 'settings' && <Settings ctx={ctx} />}
        </>
      )}
    </div>
  )
}

// ─── Factures ─────────────────────────────────────────────────────────────────

function InvoiceList({ ctx, onLocked }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode, can } = ctx
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(
    async (after) => {
      try {
        const res = await authApi.get(`${base}/invoices`, { params: { mode, limit: 25, ...(status ? { status } : {}), ...(q ? { q } : {}), ...(after ? { starting_after: after } : {}) } })
        setList((cur) => (after && cur ? { ...res.data, data: [...cur.data, ...res.data.data] } : res.data))
        setError(null)
      } catch (err) {
        if (isLocked(err)) onLocked()
        else setError(errorMessage(err, tr('auth.error.generic')))
      }
    },
    [base, mode, status, q, tr, onLocked],
  )

  useEffect(() => {
    load()
  }, [load])

  const open = list?.data.filter((i) => ['envoyée', 'partiellement_payée', 'en_retard'].includes(i.status)) ?? []
  const due = open.reduce((s, i) => s + i.amount_due, 0)
  const late = open.filter((i) => i.status === 'en_retard')

  return (
    <>
      <ErrorBox error={error} />
      {list && (
        <StatGrid>
          <Stat label={tr('inv.stat.open')} value={open.length} />
          <Stat label={tr('inv.stat.due')} value={money(due)} />
          <Stat label={tr('inv.stat.late')} value={late.length} color={late.length ? '#dc2626' : undefined} hint={money(late.reduce((s, i) => s + i.amount_due, 0))} />
        </StatGrid>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">{tr('common.allStatuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{tr(`inv.status.${s}`)}</option>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('inv.search')} style={{ width: 'auto', flex: '1 1 160px' }} />
        {can('invoices:write') && <Button onClick={() => setCreating(true)}>{tr('inv.new')}</Button>}
      </div>
      <Card style={{ padding: '6px 18px 14px' }}>
        {!list && !error && <Empty>{tr('common.loading')}</Empty>}
        {list?.data.length === 0 && <Empty>{tr('inv.empty')}</Empty>}
        {list?.data.map((i) => (
          <ListRow key={i.id} onClick={() => setOpenId(i.id)}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{i.customer?.name ?? tr('inv.noCustomer')}</div>
              <div style={{ fontSize: 12, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{i.number ?? tr('inv.status.brouillon')}</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 110 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{i.total_display}</div>
              {i.amount_due > 0 && i.amount_due !== i.total && <div style={{ fontSize: 12, color: t.textMuted }}>{fmt(tr('inv.remaining'), { amount: i.amount_due_display })}</div>}
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, minWidth: 90 }}>{i.due_date ? fmt(tr('inv.dueOn'), { date: day(i.due_date) }) : ''}</div>
            <Pill status={i.status} label={tr(`inv.status.${i.status}`)} />
          </ListRow>
        ))}
        {list?.has_more && (
          <div style={{ textAlign: 'center', paddingTop: 12 }}>
            <Button variant="ghost" onClick={() => load(list.next_cursor)}>{tr('common.more')}</Button>
          </div>
        )}
      </Card>
      <InvoiceDrawer ctx={ctx} id={openId} onClose={() => setOpenId(null)} onChange={() => load()} />
      <NewInvoice ctx={ctx} open={creating} onClose={() => setCreating(false)} onCreated={(inv) => { setCreating(false); load(); setOpenId(inv.id) }} />
    </>
  )
}

function InvoiceDrawer({ ctx, id, onClose, onChange }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode, can } = ctx
  const [inv, setInv] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await authApi.get(`${base}/invoices/${id}`, { params: { mode } })
      setInv(res.data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, id, mode, tr])

  useEffect(() => {
    setInv(null)
    setNotice(null)
    load()
  }, [load])

  const action = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    try {
      const res = await authApi.post(`${base}/invoices/${id}/${path}`, {}, { params: { mode } })
      if (path === 'resend') setNotice(res.data.sent ? tr('inv.resent') : tr('inv.noContact'))
      await load()
      onChange()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  const writer = can('invoices:write')
  const openStatus = inv && ['envoyée', 'partiellement_payée', 'en_retard'].includes(inv.status)

  return (
    <Drawer open={!!id} onClose={onClose} title={inv ? (inv.number ?? tr('inv.status.brouillon')) : ''}>
      <ErrorBox error={error} />
      {notice && <div role="status" style={{ background: t.surfaceAlt, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{notice}</div>}
      {!inv && !error && <Empty>{tr('common.loading')}</Empty>}
      {inv && (
        <>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{inv.total_display}</div>
                <div style={{ fontSize: 13, color: t.textMuted }}>{inv.customer?.name ?? tr('inv.noCustomer')}{inv.student ? ` · ${inv.student.name}` : ''}</div>
              </div>
              <Pill status={inv.status} label={tr(`inv.status.${inv.status}`)} />
            </div>
            {inv.amount_paid > 0 && (
              <div style={{ fontSize: 14, marginTop: 8 }}>
                {fmt(tr('inv.paidOf'), { paid: money(inv.amount_paid, inv.currency), due: money(inv.amount_due, inv.currency) })}
              </div>
            )}
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>
              {fmt(tr('inv.issued'), { date: day(inv.issue_date) })}{inv.due_date ? ` · ${fmt(tr('inv.dueOn'), { date: day(inv.due_date) })}` : ''}
            </div>
          </Card>

          {inv.payment_url && (
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 4 }}>{tr('inv.payLink')}</div>
              <div style={{ fontSize: 13, overflowWrap: 'anywhere', marginBottom: 8 }}>{inv.payment_url}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(inv.payment_url)}>{tr('common.copy')}</Button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`${inv.number} : ${inv.amount_due_display} ${inv.payment_url}`)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: t.primary, padding: '10px 6px' }}>WhatsApp</a>
              </div>
            </Card>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 800, margin: '14px 0 8px' }}>{tr('inv.lines')}</h3>
          <Card style={{ marginBottom: 12 }}>
            {inv.lines.map((l) => (
              <div key={l.id} style={{ display: 'flex', gap: 10, fontSize: 14, padding: '6px 0', borderTop: `1px solid ${t.border}` }}>
                <span style={{ flex: 1 }}>{l.description} <span style={{ color: t.textMuted }}>× {l.quantity.toLocaleString('fr-FR')}</span></span>
                <strong>{money(l.amount, inv.currency)}</strong>
              </div>
            ))}
            {inv.tax_amount > 0 && <div style={{ fontSize: 13, color: t.textMuted, textAlign: 'right', marginTop: 6 }}>{fmt(tr('inv.tax'), { amount: money(inv.tax_amount, inv.currency) })}</div>}
          </Card>

          {inv.installments.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: '14px 0 8px' }}>{tr('inv.schedule')}</h3>
              <Card style={{ marginBottom: 12 }}>
                {inv.installments.map((i) => (
                  <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${t.border}`, fontSize: 14 }}>
                    <span style={{ flex: '1 1 160px' }}>{i.label ?? fmt(tr('inv.installmentN'), { n: i.position })} · {day(i.due_date)}</span>
                    <strong>{i.amount_display}</strong>
                    <Pill status={i.status} label={tr(`inv.inst.${i.status}`)} />
                    {i.payment_url && <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(i.payment_url)}>{tr('common.copyLink')}</Button>}
                  </div>
                ))}
              </Card>
            </>
          )}

          {inv.receipts.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: '14px 0 8px' }}>{tr('inv.tab.receipts')}</h3>
              <Card style={{ marginBottom: 12 }}>
                {inv.receipts.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${t.border}`, fontSize: 14 }}>
                    <span style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace" }}>{r.number}</span>
                    <span>{money(r.amount, inv.currency)}</span>
                    <Button variant="ghost" onClick={() => openPdf(`${base}/receipts/${r.id}/pdf`)}>PDF</Button>
                  </div>
                ))}
              </Card>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {writer && inv.status === 'brouillon' && <Button disabled={busy} onClick={() => action('send')}>{tr('inv.send')}</Button>}
            {writer && openStatus && <Button variant="ghost" disabled={busy} onClick={() => action('resend')}>{tr('inv.resend')}</Button>}
            <Button variant="ghost" onClick={() => openPdf(`${base}/invoices/${inv.id}/pdf`, { mode })}>PDF</Button>
            {writer && inv.amount_paid === 0 && inv.status !== 'annulée' && (
              <Button variant="ghost" disabled={busy} onClick={() => action('void', tr('inv.voidConfirm'))}>{tr('inv.void')}</Button>
            )}
          </div>
          {inv.status === 'brouillon' && <p style={{ fontSize: 12, color: t.textMuted }}>{tr('inv.draftHint')}</p>}
        </>
      )}
    </Drawer>
  )
}

function NewInvoice({ ctx, open, onClose, onCreated }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode } = ctx
  const blankLine = { description: '', quantity: 1, unit_price: '', tax_rate: '' }
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [lines, setLines] = useState([blankLine])
  const [dueDate, setDueDate] = useState('')
  const [split, setSplit] = useState(false)
  const [installments, setInstallments] = useState([{ due_date: '', amount: '' }, { due_date: '', amount: '' }])
  const [notes, setNotes] = useState('')
  const [send, setSend] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setLines([blankLine])
    setSplit(false)
    setError(null)
    authApi.get(`${base}/customers`, { params: { mode, limit: 100 } }).then((r) => setCustomers(r.data.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base, mode])

  const total = lines.reduce((s, l) => {
    const amount = Math.round(Number(l.quantity || 0) * Number(l.unit_price || 0))
    return s + amount + Math.round((amount * Number(l.tax_rate || 0)) / 100)
  }, 0)
  const scheduled = installments.reduce((s, i) => s + Number(i.amount || 0), 0)

  const setLine = (idx, k) => (e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [k]: e.target.value } : l)))
  const setInst = (idx, k) => (e) => setInstallments((xs) => xs.map((x, i) => (i === idx ? { ...x, [k]: e.target.value } : x)))

  const submit = async (e) => {
    e.preventDefault()
    if (split && scheduled !== total) {
      setError(fmt(tr('inv.scheduleMismatch'), { sum: money(scheduled), total: money(total) }))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await authApi.post(
        `${base}/invoices`,
        {
          ...(customerId ? { customer_id: customerId } : {}),
          lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), ...(l.tax_rate ? { tax_rate: Number(l.tax_rate) } : {}) })),
          ...(split ? { installments: installments.map((i) => ({ due_date: i.due_date, amount: Number(i.amount) })) } : dueDate ? { due_date: dueDate } : {}),
          ...(notes ? { notes } : {}),
          send,
        },
        { params: { mode } },
      )
      onCreated(res.data)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  const small = { width: 'auto' }
  return (
    <Drawer open={open} onClose={onClose} title={tr('inv.new')}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <Card style={{ marginBottom: 12 }}>
          <Field label={tr('inv.customer')}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{tr('inv.noCustomer')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </Select>
          </Field>
          {customers.length === 0 && <p style={{ fontSize: 12, color: t.textMuted, margin: '-6px 0 8px' }}>{tr('inv.customerHint')}</p>}
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{tr('inv.lines')}</strong>
          {lines.map((l, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, padding: '10px 0', borderTop: idx ? `1px solid ${t.border}` : 'none' }}>
              <Input required maxLength={250} value={l.description} onChange={setLine(idx, 'description')} placeholder={tr('inv.lineDescription')} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Input type="number" min="0.001" step="0.001" required value={l.quantity} onChange={setLine(idx, 'quantity')} aria-label={tr('inv.qty')} style={{ ...small, flex: '0 1 80px' }} />
                <Input type="number" min="0" step="1" inputMode="numeric" required value={l.unit_price} onChange={setLine(idx, 'unit_price')} placeholder={tr('inv.unitPrice')} style={{ ...small, flex: '1 1 120px' }} />
                <Input type="number" min="0" max="100" step="0.01" value={l.tax_rate} onChange={setLine(idx, 'tax_rate')} placeholder={tr('inv.taxRate')} style={{ ...small, flex: '0 1 90px' }} />
                {lines.length > 1 && <Button variant="ghost" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>×</Button>}
              </div>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setLines((ls) => [...ls, blankLine])}>{tr('inv.addLine')}</Button>
          <div style={{ textAlign: 'right', fontSize: 18, fontWeight: 800, marginTop: 8 }}>{fmt(tr('inv.totalIs'), { amount: money(total) })}</div>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 10 }}>
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> {tr('inv.split')}
          </label>
          {!split && <Field label={tr('inv.dueDate')}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
          {split && (
            <>
              {installments.map((i, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Input type="date" required value={i.due_date} onChange={setInst(idx, 'due_date')} style={{ ...small, flex: '1 1 140px' }} />
                  <Input type="number" min="1" step="1" required value={i.amount} onChange={setInst(idx, 'amount')} placeholder={tr('inv.amount')} style={{ ...small, flex: '1 1 120px' }} />
                  {installments.length > 2 && <Button variant="ghost" onClick={() => setInstallments((xs) => xs.filter((_, j) => j !== idx))}>×</Button>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="ghost" onClick={() => setInstallments((xs) => [...xs, { due_date: '', amount: '' }])}>{tr('inv.addInstallment')}</Button>
                <span style={{ fontSize: 13, color: scheduled === total ? '#16a34a' : '#d97706' }}>{fmt(tr('inv.scheduled'), { sum: money(scheduled), total: money(total) })}</span>
              </div>
            </>
          )}
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Field label={tr('inv.notes')}><Input maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> {tr('inv.sendNow')}
          </label>
        </Card>
        <Button type="submit" disabled={busy || total <= 0} style={{ width: '100%', padding: 12 }}>{send ? tr('inv.createSend') : tr('inv.createDraft')}</Button>
      </form>
    </Drawer>
  )
}

// ─── Clients ──────────────────────────────────────────────────────────────────

function Customers({ ctx }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode, can } = ctx
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await authApi.get(`${base}/customers`, { params: { mode, limit: 100, ...(q ? { q } : {}) } })
      setList(res.data)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, mode, q, tr])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <ErrorBox error={error} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('inv.customerSearch')} style={{ width: 'auto', flex: '1 1 200px' }} />
        {can('invoices:write') && <Button onClick={() => setEdit({ name: '', phone: '', email: '', notes: '', channels: ['sms'] })}>{tr('inv.newCustomer')}</Button>}
      </div>
      <Card style={{ padding: '6px 18px 14px' }}>
        {list?.data.length === 0 && <Empty>{tr('inv.noCustomers')}</Empty>}
        {list?.data.map((c) => (
          <ListRow key={c.id} onClick={can('invoices:write') ? () => setEdit(c) : undefined}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <span style={{ fontSize: 12, color: t.textMuted }}>{c.channels.map((ch) => tr(`channel.${ch}`)).join(' → ')}</span>
          </ListRow>
        ))}
      </Card>
      <CustomerDrawer ctx={ctx} customer={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
    </>
  )
}

function CustomerDrawer({ ctx, customer, onClose, onSaved }) {
  const { t: tr } = useT()
  const { base, mode } = ctx
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setForm(customer ? { ...customer, phone: customer.phone ?? '', email: customer.email ?? '', notes: customer.notes ?? '' } : null)
    setError(null)
  }, [customer])

  if (!form) return null
  const toggleChannel = (ch) =>
    setForm((f) => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter((x) => x !== ch) : [...f.channels, ch] }))

  const save = async (e) => {
    e.preventDefault()
    if (form.channels.length === 0) {
      setError(tr('inv.channelRequired'))
      return
    }
    const body = { name: form.name, phone: form.phone || undefined, email: form.email || undefined, notes: form.notes || undefined, channels: form.channels }
    try {
      if (form.id) await authApi.patch(`${base}/customers/${form.id}`, body, { params: { mode } })
      else await authApi.post(`${base}/customers`, body, { params: { mode } })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  const remove = async () => {
    if (!window.confirm(tr('inv.deleteCustomerConfirm'))) return
    try {
      await authApi.delete(`${base}/customers/${form.id}`, { params: { mode } })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  return (
    <Drawer open onClose={onClose} title={form.id ? form.name : tr('inv.newCustomer')}>
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <Card style={{ marginBottom: 12 }}>
          <Field label={tr('inv.customerName')}><Input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={tr('inv.phone')}><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="06 123 45 67" /></Field>
          <Field label={tr('inv.email')}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={tr('inv.notes')}><Input maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div style={{ fontSize: 12, marginBottom: 6 }}>{tr('inv.channels')}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
            {CHANNELS.map((ch) => (
              <label key={ch} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={form.channels.includes(ch)} onChange={() => toggleChannel(ch)} />
                {tr(`channel.${ch}`)}{form.channels.includes(ch) ? ` (${form.channels.indexOf(ch) + 1})` : ''}
              </label>
            ))}
          </div>
        </Card>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit">{tr('common.save')}</Button>
          {form.id && <Button variant="ghost" onClick={remove}>{tr('common.delete')}</Button>}
        </div>
      </form>
    </Drawer>
  )
}

// ─── Reçus ────────────────────────────────────────────────────────────────────

function Receipts({ ctx }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode } = ctx
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(
    async (after) => {
      try {
        const res = await authApi.get(`${base}/receipts`, { params: { mode, limit: 50, ...(after ? { starting_after: after } : {}) } })
        setList((cur) => (after && cur ? { ...res.data, data: [...cur.data, ...res.data.data] } : res.data))
      } catch (err) {
        setError(errorMessage(err, tr('auth.error.generic')))
      }
    },
    [base, mode, tr],
  )

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <ErrorBox error={error} />
      <p style={{ fontSize: 13, color: t.textMuted, marginTop: 0 }}>{tr('inv.receiptsIntro')}</p>
      <Card style={{ padding: '6px 18px 14px' }}>
        {list?.data.length === 0 && <Empty>{tr('inv.noReceipts')}</Empty>}
        {list?.data.map((r) => (
          <ListRow key={r.id}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, flex: '0 0 auto' }}>{r.number}</span>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.amount_display}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{[r.payer_name, r.description, dateTime(r.created_at)].filter(Boolean).join(' · ')}</div>
            </div>
            {r.sent_at && <Pill status="réussi" label={tr('inv.receiptSent')} />}
            <Button variant="ghost" onClick={() => openPdf(`${base}/receipts/${r.id}/pdf`)}>PDF</Button>
          </ListRow>
        ))}
        {list?.has_more && (
          <div style={{ textAlign: 'center', paddingTop: 12 }}>
            <Button variant="ghost" onClick={() => load(list.next_cursor)}>{tr('common.more')}</Button>
          </div>
        )}
      </Card>
    </>
  )
}

// ─── Réglages des relances ────────────────────────────────────────────────────

function Settings({ ctx }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, can } = ctx
  const [s, setS] = useState(null)
  const [offsets, setOffsets] = useState('')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    authApi
      .get(`${base}/recovery-settings`)
      .then((r) => {
        setS(r.data)
        setOffsets(r.data.reminder_offsets.join(', '))
      })
      .catch((err) => setError(errorMessage(err, tr('auth.error.generic'))))
  }, [base, tr])

  if (!s) return <ErrorBox error={error} />
  const writer = can('invoices:write')

  const save = async (e) => {
    e.preventDefault()
    setSaved(false)
    setError(null)
    const parsed = offsets.split(/[\s,;]+/).filter(Boolean).map(Number)
    if (parsed.length === 0 || parsed.some((n) => !Number.isInteger(n))) {
      setError(tr('inv.offsetsInvalid'))
      return
    }
    try {
      const res = await authApi.patch(`${base}/recovery-settings`, { reminder_offsets: parsed, send_from_hour: Number(s.send_from_hour), send_until_hour: Number(s.send_until_hour), reminders_enabled: s.reminders_enabled })
      setS(res.data)
      setOffsets(res.data.reminder_offsets.join(', '))
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  const label = (o) => (o === 0 ? tr('inv.offset.zero') : fmt(tr(o < 0 ? 'inv.offset.before' : 'inv.offset.after'), { n: Math.abs(o) }))

  return (
    <Card style={{ maxWidth: 560 }}>
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14 }}>
          <input type="checkbox" disabled={!writer} checked={s.reminders_enabled} onChange={(e) => setS({ ...s, reminders_enabled: e.target.checked })} /> {tr('inv.remindersEnabled')}
        </label>
        <Field label={tr('inv.offsets')}>
          <Input disabled={!writer} value={offsets} onChange={(e) => setOffsets(e.target.value)} placeholder="-3, 0, 3, 7" />
        </Field>
        <p style={{ fontSize: 12, color: t.textMuted, marginTop: -8 }}>{s.reminder_offsets.map(label).join(' · ')}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label={tr('inv.fromHour')}><Input type="number" min="0" max="23" disabled={!writer} value={s.send_from_hour} onChange={(e) => setS({ ...s, send_from_hour: e.target.value })} /></Field>
          <Field label={tr('inv.untilHour')}><Input type="number" min="1" max="24" disabled={!writer} value={s.send_until_hour} onChange={(e) => setS({ ...s, send_until_hour: e.target.value })} /></Field>
        </div>
        <p style={{ fontSize: 12, color: t.textMuted, marginTop: -6 }}>{tr('inv.timezone')}</p>
        {writer && <Button type="submit">{tr('common.save')}</Button>}
        {saved && <span role="status" style={{ marginLeft: 10, fontSize: 13, color: '#16a34a' }}>{tr('common.saved')}</span>}
      </form>
    </Card>
  )
}
