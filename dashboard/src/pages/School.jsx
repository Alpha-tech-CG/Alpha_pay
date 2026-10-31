import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input, Select } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { day, download, fmt, isLocked, money, useMerchant } from '../merchant'
import { Drawer, Empty, ErrorBox, ListRow, ModeSwitch, PageHeader, Pill, Stat, StatGrid, Tabs } from '../merchantUi'
import Locked from './Locked'

/**
 * Pack École (§M8) : années, classes, élèves et responsables, import CSV ou
 * Excel, grilles de frais et échéanciers, lien de paiement par élève, impayés
 * par classe en un écran, retardataires exportables.
 */
export default function School() {
  const { t: tr } = useT()
  const ctx = useMerchant()
  const { base, mode, setMode, canLive, can } = ctx
  const [years, setYears] = useState(null)
  const [yearId, setYearId] = useState('')
  const [tab, setTab] = useState('dashboard')
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(false)

  const loadYears = useCallback(async () => {
    if (!base) return
    try {
      const res = await authApi.get(`${base}/school/years`)
      setYears(res.data.data)
      setYearId((cur) => cur || res.data.data.find((y) => y.active)?.id || res.data.data[0]?.id || '')
    } catch (err) {
      if (isLocked(err)) setLocked(true)
      else setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, tr])

  useEffect(() => {
    loadYears()
  }, [loadYears])

  if (!can('school:view')) return <Empty>{tr('common.forbidden')}</Empty>
  const school = `${base}/school`

  return (
    <div>
      <PageHeader title={tr('school.title')} intro={tr('school.intro')}>
        {years?.length > 0 && (
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label={tr('school.year')} style={{ width: 'auto' }}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.label}{y.active ? ' ★' : ''}</option>)}
          </Select>
        )}
        <ModeSwitch mode={mode} setMode={setMode} canLive={canLive} />
      </PageHeader>
      <ErrorBox error={error} />
      {locked && <Locked module={tr('module.m8_school')} />}
      {years?.length === 0 && <NewYear school={school} onCreated={loadYears} canManage={can('school:manage')} />}
      {years?.length > 0 && yearId && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'dashboard', label: tr('school.tab.dashboard') },
              { value: 'classes', label: tr('school.tab.classes') },
              { value: 'fees', label: tr('school.tab.fees') },
              { value: 'late', label: tr('school.tab.late') },
            ]}
          />
          {tab === 'dashboard' && <Dashboard school={school} mode={mode} yearId={yearId} />}
          {tab === 'classes' && <Classes ctx={ctx} school={school} yearId={yearId} />}
          {tab === 'fees' && <Fees ctx={ctx} school={school} yearId={yearId} />}
          {tab === 'late' && <Late school={school} mode={mode} yearId={yearId} />}
        </>
      )}
    </div>
  )
}

function NewYear({ school, onCreated, canManage }) {
  const { t: tr } = useT()
  const y = new Date().getFullYear()
  const [form, setForm] = useState({ label: `${y}-${y + 1}`, starts_on: `${y}-10-01`, ends_on: `${y + 1}-07-15` })
  const [error, setError] = useState(null)
  if (!canManage) return <Empty>{tr('school.noYear')}</Empty>
  const submit = async (e) => {
    e.preventDefault()
    try {
      await authApi.post(`${school}/years`, form)
      onCreated()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }
  return (
    <Card style={{ maxWidth: 520 }}>
      <strong style={{ fontSize: 15 }}>{tr('school.newYear')}</strong>
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <ErrorBox error={error} />
        <Field label={tr('school.yearLabel')}><Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label={tr('school.startsOn')}><Input type="date" required value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></Field>
          <Field label={tr('school.endsOn')}><Input type="date" required value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></Field>
        </div>
        <Button type="submit">{tr('school.createYear')}</Button>
      </form>
    </Card>
  )
}

// ─── Tableau de bord : impayés par classe en un écran ────────────────────────

function Dashboard({ school, mode, yearId }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authApi
      .get(`${school}/dashboard`, { params: { mode, year_id: yearId } })
      .then((r) => setD(r.data))
      .catch((err) => setError(errorMessage(err, tr('auth.error.generic'))))
  }, [school, mode, yearId, tr])

  if (!d) return error ? <ErrorBox error={error} /> : <Empty>{tr('common.loading')}</Empty>
  const tot = d.totals
  const maxDue = Math.max(1, ...d.by_class.map((c) => c.outstanding))

  return (
    <>
      <StatGrid>
        <Stat label={tr('school.expected')} value={tot.expected_display} hint={fmt(tr('school.students'), { n: tot.student_count })} />
        <Stat label={tr('school.collected')} value={tot.collected_display} hint={`${tot.collection_rate.toLocaleString('fr-FR')} %`} color="#16a34a" />
        <Stat label={tr('school.outstanding')} value={tot.outstanding_display} />
        <Stat label={tr('school.overdue')} value={tot.overdue_display} hint={fmt(tr('school.lateStudents'), { n: tot.late_students })} color={tot.late_students ? '#dc2626' : undefined} />
      </StatGrid>
      <Card style={{ padding: '6px 18px 14px' }}>
        <div style={{ fontWeight: 800, fontSize: 15, padding: '10px 0 4px' }}>{tr('school.byClass')}</div>
        {d.by_class.length === 0 && <Empty>{tr('school.noClass')}</Empty>}
        {d.by_class.map((c) => (
          <div key={c.id} style={{ borderTop: `1px solid ${t.border}`, padding: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15, flex: '1 1 120px' }}>{c.name}</strong>
              <span style={{ fontSize: 12, color: t.textMuted }}>{fmt(tr('school.students'), { n: c.student_count })}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: c.overdue ? '#dc2626' : t.text }}>{fmt(tr('school.unpaid'), { amount: c.outstanding_display })}</span>
            </div>
            <div style={{ height: 8, background: t.surfaceAlt, borderRadius: 9999, margin: '8px 0 6px', overflow: 'hidden' }} aria-hidden>
              <div style={{ width: `${c.expected ? (c.collected / c.expected) * 100 : 0}%`, height: '100%', background: '#16a34a' }} />
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>{fmt(tr('school.collectedOf'), { collected: c.collected_display, expected: c.expected_display, rate: c.collection_rate.toLocaleString('fr-FR') })}</span>
              {c.late_students > 0 && <span style={{ color: '#dc2626' }}>{fmt(tr('school.lateLine'), { n: c.late_students, amount: c.overdue_display })}</span>}
              {c.outstanding === maxDue && c.outstanding > 0 && d.by_class.length > 1 && <Pill status="en_retard" label={tr('school.mostUnpaid')} />}
            </div>
          </div>
        ))}
      </Card>
    </>
  )
}

// ─── Classes et élèves ────────────────────────────────────────────────────────

function Classes({ ctx, school, yearId }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { can, mode } = ctx
  const [classes, setClasses] = useState(null)
  const [classId, setClassId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await authApi.get(`${school}/years/${yearId}/classes`)
      setClasses(res.data.data)
      setClassId((cur) => (res.data.data.some((c) => c.id === cur) ? cur : res.data.data[0]?.id ?? ''))
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [school, yearId, tr])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e) => {
    e.preventDefault()
    try {
      const res = await authApi.post(`${school}/years/${yearId}/classes`, { name })
      setName('')
      await load()
      setClassId(res.data.id)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  return (
    <>
      <ErrorBox error={error} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {classes?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClassId(c.id)}
            aria-pressed={classId === c.id}
            style={{ border: `1px solid ${classId === c.id ? t.primary : t.border}`, background: classId === c.id ? t.primary : t.surface, color: classId === c.id ? t.primaryText : t.text, borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            {c.name} · {c.student_count}
          </button>
        ))}
        {can('school:manage') && (
          <form onSubmit={create} style={{ display: 'flex', gap: 6 }}>
            <Input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('school.newClass')} style={{ width: 150 }} />
            <Button type="submit" variant="ghost">+</Button>
          </form>
        )}
      </div>
      {classes?.length === 0 && <Empty>{tr('school.noClass')}</Empty>}
      {classId && <Students ctx={ctx} school={school} classId={classId} mode={mode} onImported={load} />}
    </>
  )
}

function Students({ ctx, school, classId, mode, onImported }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { can } = ctx
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(
    async (after) => {
      try {
        const res = await authApi.get(`${school}/students`, { params: { class_id: classId, limit: 50, ...(q ? { q } : {}), ...(after ? { starting_after: after } : {}) } })
        setList((cur) => (after && cur ? { ...res.data, data: [...cur.data, ...res.data.data] } : res.data))
      } catch (err) {
        setError(errorMessage(err, tr('auth.error.generic')))
      }
    },
    [school, classId, q, tr],
  )

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <ErrorBox error={error} />
      {can('school:manage') && <Import school={school} classId={classId} onDone={() => { load(); onImported() }} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('school.searchStudent')} style={{ width: 'auto', flex: '1 1 200px' }} />
        {can('school:manage') && <Button onClick={() => setAdding(true)}>{tr('school.addStudent')}</Button>}
      </div>
      <Card style={{ padding: '6px 18px 14px' }}>
        {list?.data.length === 0 && <Empty>{tr('school.noStudent')}</Empty>}
        {list?.data.map((s) => {
          const g = s.guardians[0]
          return (
            <ListRow key={s.id} onClick={() => setOpenId(s.id)}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.last_name} {s.first_name}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{s.registration_no ?? '—'}{g ? ` · ${g.name}${g.phone ? ` (${g.phone})` : ''}` : ` · ${tr('school.noGuardian')}`}</div>
              </div>
            </ListRow>
          )
        })}
        {list?.has_more && (
          <div style={{ textAlign: 'center', paddingTop: 12 }}>
            <Button variant="ghost" onClick={() => load(list.next_cursor)}>{tr('common.more')}</Button>
          </div>
        )}
      </Card>
      <StudentDrawer ctx={ctx} school={school} mode={mode} id={openId} onClose={() => setOpenId(null)} />
      <AddStudent school={school} classId={classId} open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); onImported() }} />
    </>
  )
}

function Import({ school, classId, onDone }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [file, setFile] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await authApi.post(`${school}/classes/${classId}/import`, form, { timeout: 180_000 })
      setReport(res.data)
      onDone()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: 14, flex: '1 1 160px' }}>{tr('school.import')}</strong>
        <Button variant="ghost" onClick={() => download(`${school}/import-template`, 'modele-import-eleves.csv', { format: 'csv' })}>{tr('school.templateCsv')}</Button>
        <Button variant="ghost" onClick={() => download(`${school}/import-template`, 'modele-import-eleves.xlsx', { format: 'xlsx' })}>{tr('school.templateXlsx')}</Button>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, margin: '6px 0 10px' }}>{tr('school.importIntro')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, maxWidth: '100%' }} />
        <Button disabled={!file || busy} onClick={upload}>{busy ? tr('school.importing') : tr('school.importBtn')}</Button>
      </div>
      <ErrorBox error={error} />
      {report && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <div role="status">{fmt(tr('school.importReport'), { created: report.created, updated: report.updated, errors: report.error_count })}</div>
          {report.errors.length > 0 && (
            <ul style={{ fontSize: 13, color: '#B91C1C', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>
              {report.errors.map((e, i) => <li key={i}>{fmt(tr('school.importLine'), { line: e.line })} {e.column ? `(${e.column}) ` : ''}: {e.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function AddStudent({ school, classId, open, onClose, onSaved }) {
  const { t: tr } = useT()
  const blank = { first_name: '', last_name: '', registration_no: '', g_name: '', g_phone: '', g_email: '' }
  const [f, setF] = useState(blank)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (open) {
      setF(blank)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!open) return null
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    try {
      await authApi.post(`${school}/students`, {
        first_name: f.first_name,
        last_name: f.last_name,
        school_class_id: classId,
        ...(f.registration_no ? { registration_no: f.registration_no } : {}),
        ...(f.g_name ? { guardians: [{ name: f.g_name, ...(f.g_phone ? { phone: f.g_phone } : {}), ...(f.g_email ? { email: f.g_email } : {}), is_primary: true }] } : {}),
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }
  return (
    <Drawer open onClose={onClose} title={tr('school.addStudent')}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <Card style={{ marginBottom: 12 }}>
          <Field label={tr('school.firstName')}><Input required value={f.first_name} onChange={set('first_name')} /></Field>
          <Field label={tr('school.lastName')}><Input required value={f.last_name} onChange={set('last_name')} /></Field>
          <Field label={tr('school.registration')}><Input value={f.registration_no} onChange={set('registration_no')} /></Field>
        </Card>
        <Card style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{tr('school.guardian')}</strong>
          <Field label={tr('inv.customerName')}><Input value={f.g_name} onChange={set('g_name')} /></Field>
          <Field label={tr('inv.phone')}><Input type="tel" value={f.g_phone} onChange={set('g_phone')} placeholder="06 123 45 67" /></Field>
          <Field label={tr('inv.email')}><Input type="email" value={f.g_email} onChange={set('g_email')} /></Field>
        </Card>
        <Button type="submit">{tr('common.save')}</Button>
      </form>
    </Drawer>
  )
}

function StudentDrawer({ ctx, school, mode, id, onClose }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [s, setS] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    setS(null)
    setNotice(null)
    if (!id) return
    authApi
      .get(`${school}/students/${id}`, { params: { mode } })
      .then((r) => setS(r.data))
      .catch((err) => setError(errorMessage(err, tr('auth.error.generic'))))
  }, [school, id, mode, tr])

  const sendLinks = async () => {
    try {
      const res = await authApi.post(`${school}/students/${id}/send-links`, {}, { params: { mode } })
      setNotice(res.data.sent ? tr('school.linkSent') : tr('inv.noContact'))
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  return (
    <Drawer open={!!id} onClose={onClose} title={s ? `${s.first_name} ${s.last_name}` : ''}>
      <ErrorBox error={error} />
      {notice && <div role="status" style={{ background: t.surfaceAlt, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{notice}</div>}
      {s && (
        <>
          <Card style={{ marginBottom: 12, fontSize: 14 }}>
            <div>{tr('school.registration')} : <strong>{s.registration_no ?? '—'}</strong></div>
            <div>{tr('school.class')} : <strong>{s.school_class?.name ?? '—'}</strong></div>
            {s.guardians.map((g) => (
              <div key={g.id} style={{ marginTop: 6 }}>
                {g.is_primary ? '★ ' : ''}{g.name}{g.relation ? ` (${g.relation})` : ''} · {[g.phone, g.email].filter(Boolean).join(' · ') || '—'}
              </div>
            ))}
          </Card>
          {s.invoices.length === 0 && <Empty>{tr('school.noInvoice')}</Empty>}
          {s.invoices.map((inv) => (
            <Card key={inv.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <strong style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{inv.number}</strong>
                <Pill status={inv.status} label={tr(`inv.status.${inv.status}`)} />
              </div>
              {(inv.installments.length ? inv.installments : [{ id: inv.id, label: inv.lines[0]?.description, due_date: inv.due_date, amount_display: inv.total_display, status: inv.status === 'payée' ? 'payé' : 'en_attente', payment_url: inv.payment_url }]).map((i) => (
                <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${t.border}`, fontSize: 13 }}>
                  <span style={{ flex: '1 1 140px' }}>{i.label} · {day(i.due_date)}</span>
                  <strong>{i.amount_display}</strong>
                  <Pill status={i.status} label={tr(`inv.inst.${i.status}`)} />
                  {i.payment_url && <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(i.payment_url)}>{tr('common.copyLink')}</Button>}
                </div>
              ))}
            </Card>
          ))}
          {ctx.can('school:manage') && s.invoices.some((i) => i.payment_url) && <Button onClick={sendLinks}>{tr('school.sendLink')}</Button>}
        </>
      )}
    </Drawer>
  )
}

// ─── Grilles de frais ────────────────────────────────────────────────────────

function Fees({ ctx, school, yearId }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { can, mode } = ctx
  const [grids, setGrids] = useState(null)
  const [classes, setClasses] = useState([])
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([authApi.get(`${school}/years/${yearId}/fee-grids`, { params: { mode } }), authApi.get(`${school}/years/${yearId}/classes`)])
      setGrids(g.data.data)
      setClasses(c.data.data)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [school, yearId, mode, tr])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (grid) => {
    if (!window.confirm(fmt(tr('school.applyConfirm'), { label: grid.label, cls: grid.school_class?.name ?? '' }))) return
    setBusy(grid.id)
    setError(null)
    setResult(null)
    try {
      const res = await authApi.post(`${school}/fee-grids/${grid.id}/apply`, {}, { params: { mode }, timeout: 300_000 })
      setResult(res.data)
      await load()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(null)
    }
  }

  const sendClass = async (grid) => {
    setBusy(grid.id)
    try {
      const res = await authApi.post(`${school}/classes/${grid.school_class.id}/send-links`, {}, { params: { mode }, timeout: 300_000 })
      setResult({ links: res.data })
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <ErrorBox error={error} />
      {result?.invoices_created != null && (
        <div role="status" style={{ background: t.surfaceAlt, borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 12 }}>
          {fmt(tr('school.applied'), { created: result.invoices_created, already: result.already_billed, s: (result.duration_ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) })}
          {result.students_without_contact.length > 0 && <div style={{ color: '#B45309', marginTop: 4 }}>{fmt(tr('school.noContact'), { n: result.students_without_contact.length })}</div>}
        </div>
      )}
      {result?.links && (
        <div role="status" style={{ background: t.surfaceAlt, borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 12 }}>
          {fmt(tr('school.linksSent'), { sent: result.links.sent, total: result.links.invoices })}
        </div>
      )}
      {can('school:manage') && <div style={{ marginBottom: 12 }}><Button onClick={() => setCreating(true)} disabled={classes.length === 0}>{tr('school.newGrid')}</Button></div>}
      {grids?.length === 0 && <Empty>{tr('school.noGrid')}</Empty>}
      {grids?.map((g) => (
        <Card key={g.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <strong style={{ fontSize: 15 }}>{g.label}</strong>
              <div style={{ fontSize: 12, color: t.textMuted }}>{g.school_class?.name} · {g.total_display} · {fmt(tr('school.billed'), { n: g.students_billed })}</div>
            </div>
            {can('school:manage') && <Button disabled={busy === g.id} onClick={() => apply(g)}>{busy === g.id ? tr('school.applying') : tr('school.apply')}</Button>}
            {can('school:manage') && g.students_billed > 0 && <Button variant="ghost" disabled={busy === g.id} onClick={() => sendClass(g)}>{tr('school.sendLinks')}</Button>}
          </div>
          {g.lines.map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 0', borderTop: `1px solid ${t.border}`, marginTop: 6 }}>
              <span style={{ flex: 1 }}>{l.label}</span>
              <span style={{ color: t.textMuted }}>{day(l.due_date)}</span>
              <strong>{money(l.amount, g.currency)}</strong>
            </div>
          ))}
        </Card>
      ))}
      <NewGrid school={school} yearId={yearId} classes={classes} open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
    </>
  )
}

function NewGrid({ school, yearId, classes, open, onClose, onSaved }) {
  const { t: tr } = useT()
  const [label, setLabel] = useState('')
  const [classId, setClassId] = useState('')
  const [lines, setLines] = useState([{ label: '', amount: '', due_date: '' }])
  const [error, setError] = useState(null)
  useEffect(() => {
    if (open) {
      setClassId(classes[0]?.id ?? '')
      setError(null)
    }
  }, [open, classes])
  if (!open) return null
  const setLine = (idx, k) => (e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [k]: e.target.value } : l)))
  const submit = async (e) => {
    e.preventDefault()
    try {
      await authApi.post(`${school}/years/${yearId}/fee-grids`, { label, school_class_id: classId, lines: lines.map((l) => ({ label: l.label, amount: Number(l.amount), due_date: l.due_date })) })
      setLabel('')
      setLines([{ label: '', amount: '', due_date: '' }])
      onSaved()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  return (
    <Drawer open onClose={onClose} title={tr('school.newGrid')}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <Card style={{ marginBottom: 12 }}>
          <Field label={tr('school.gridLabel')}><Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('school.gridPlaceholder')} /></Field>
          <Field label={tr('school.class')}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </Card>
        <Card style={{ marginBottom: 12 }}>
          {lines.map((l, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Input required value={l.label} onChange={setLine(idx, 'label')} placeholder={tr('school.feeLabel')} style={{ width: 'auto', flex: '1 1 160px' }} />
              <Input type="number" min="1" step="1" required value={l.amount} onChange={setLine(idx, 'amount')} placeholder={tr('inv.amount')} style={{ width: 'auto', flex: '1 1 100px' }} />
              <Input type="date" required value={l.due_date} onChange={setLine(idx, 'due_date')} aria-label={tr('school.feeDue')} style={{ width: 'auto', flex: '1 1 140px' }} />
              {lines.length > 1 && <Button variant="ghost" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>×</Button>}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setLines((ls) => [...ls, { label: '', amount: '', due_date: '' }])}>{tr('school.addFee')}</Button>
          <div style={{ textAlign: 'right', fontWeight: 800, marginTop: 8 }}>{fmt(tr('inv.totalIs'), { amount: money(total) })}</div>
        </Card>
        <Button type="submit">{tr('common.save')}</Button>
      </form>
    </Drawer>
  )
}

// ─── Retardataires ───────────────────────────────────────────────────────────

function Late({ school, mode, yearId }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authApi.get(`${school}/years/${yearId}/classes`).then((r) => setClasses(r.data.data)).catch(() => {})
  }, [school, yearId])

  useEffect(() => {
    setList(null)
    authApi
      .get(`${school}/late-students`, { params: { mode, year_id: yearId, ...(classId ? { class_id: classId } : {}) } })
      .then((r) => setList(r.data.data))
      .catch((err) => setError(errorMessage(err, tr('auth.error.generic'))))
  }, [school, mode, yearId, classId, tr])

  return (
    <>
      <ErrorBox error={error} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">{tr('school.allClasses')}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button variant="ghost" onClick={() => download(`${school}/late-students.csv`, 'retardataires.csv', { mode, year_id: yearId, ...(classId ? { class_id: classId } : {}) })}>{tr('school.exportCsv')}</Button>
      </div>
      <Card style={{ padding: '6px 18px 14px' }}>
        {!list && !error && <Empty>{tr('common.loading')}</Empty>}
        {list?.length === 0 && <Empty>{tr('school.noLate')}</Empty>}
        {list?.map((s) => (
          <ListRow key={s.student_id}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name} <span style={{ fontWeight: 400, color: t.textMuted }}>· {s.class_name}</span></div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{s.fees.join(', ')}{s.guardian ? ` · ${s.guardian.name}${s.guardian.phone ? ` (${s.guardian.phone})` : ''}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, color: '#dc2626' }}>{s.amount_overdue_display}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{fmt(tr('school.daysLate'), { n: s.days_late })}</div>
            </div>
          </ListRow>
        ))}
      </Card>
    </>
  )
}
