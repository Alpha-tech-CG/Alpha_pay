import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input, Select } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { dateTime, download, fmt, isLocked, useMerchant } from '../merchant'
import { Drawer, Empty, ErrorBox, ListRow, ModeSwitch, PageHeader, Pill, Stat, StatGrid } from '../merchantUi'
import Locked from './Locked'

const STATUSES = ['réussi', 'en_attente', 'échoué', 'expiré', 'annulé']
const OPERATORS = { mtn: 'MTN MoMo', airtel: 'Airtel Money', card: 'Carte' }
const EMPTY = { date_from: '', date_to: '', status: '', operator: '', till_id: '', q: '' }

/**
 * Encaissements (§M6) : indicateurs, liste filtrable des paiements, détail,
 * exports CSV et Excel en tâche de fond. Un caissier ne voit que sa caisse
 * (le serveur filtre) et n'a ni indicateurs globaux ni exports.
 */
export default function Payments() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { base, mode, setMode, canLive, can } = useMerchant()
  const [filters, setFilters] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [list, setList] = useState(null)
  const [stats, setStats] = useState(null)
  const [tills, setTills] = useState([])
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const manager = can('payments:view')

  const params = useCallback(
    (extra = {}) => Object.fromEntries(Object.entries({ ...applied, mode, ...extra }).filter(([, v]) => v !== '' && v != null)),
    [applied, mode],
  )

  const load = useCallback(
    async (after) => {
      if (!base) return
      setBusy(true)
      try {
        const res = await authApi.get(`${base}/payments`, { params: params({ limit: 25, starting_after: after }) })
        setList((cur) => (after && cur ? { ...res.data, data: [...cur.data, ...res.data.data] } : res.data))
        setError(null)
      } catch (err) {
        setError(errorMessage(err, tr('auth.error.generic')))
      } finally {
        setBusy(false)
      }
    },
    [base, params, tr],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!base) return
    authApi.get(`${base}/tills/mine`).then((r) => setTills(r.data.data)).catch(() => {})
    if (!manager) return
    authApi
      .get(`${base}/stats`, { params: { mode } })
      .then((r) => {
        setStats(r.data)
        setLocked(false)
      })
      .catch((err) => setLocked(isLocked(err)))
  }, [base, mode, manager])

  const open = async (p) => {
    try {
      const res = await authApi.get(`${base}/payments/${p.id}`)
      setDetail(res.data)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const tillName = (id) => {
    const till = tills.find((x) => x.id === id)
    return till ? `${till.store?.name ?? ''} · ${till.name}` : null
  }

  return (
    <div>
      <PageHeader title={tr('payments.title')} intro={tr('payments.intro')}>
        <ModeSwitch mode={mode} setMode={setMode} canLive={canLive} />
      </PageHeader>
      <ErrorBox error={error} />

      {manager && locked && <Locked module={tr('module.m6_manage')} />}
      {manager && stats && (
        <StatGrid>
          <Stat label={tr('payments.stat.today')} value={stats.day.succeeded_volume_display} hint={fmt(tr('payments.stat.count'), { n: stats.day.succeeded_count })} />
          <Stat label={tr('payments.stat.week')} value={stats.week.succeeded_volume_display} hint={fmt(tr('payments.stat.count'), { n: stats.week.succeeded_count })} />
          <Stat label={tr('payments.stat.month')} value={stats.month.succeeded_volume_display} hint={fmt(tr('payments.stat.count'), { n: stats.month.succeeded_count })} />
          <Stat label={tr('payments.stat.failure')} value={`${stats.failure_rate.toLocaleString('fr-FR')} %`} hint={tr('payments.stat.failureHint')} color={stats.failure_rate > 10 ? '#dc2626' : undefined} />
          {stats.by_operator.map((o) => (
            <Stat key={o.operator} label={fmt(tr('payments.stat.operator'), { op: OPERATORS[o.operator] ?? o.operator })} value={o.volume_display} hint={fmt(tr('payments.stat.count'), { n: o.count })} />
          ))}
        </StatGrid>
      )}

      <Card style={{ marginBottom: 16, padding: '16px 18px' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(filters)
          }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 12px', alignItems: 'end' }}
        >
          <Field label={tr('payments.filter.from')}><Input type="date" value={filters.date_from} onChange={set('date_from')} /></Field>
          <Field label={tr('payments.filter.to')}><Input type="date" value={filters.date_to} onChange={set('date_to')} /></Field>
          <Field label={tr('payments.filter.status')}>
            <Select value={filters.status} onChange={set('status')}>
              <option value="">{tr('common.all')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{tr(`status.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={tr('payments.filter.operator')}>
            <Select value={filters.operator} onChange={set('operator')}>
              <option value="">{tr('common.all')}</option>
              <option value="mtn">MTN MoMo</option>
              <option value="airtel">Airtel Money</option>
            </Select>
          </Field>
          {tills.length > 1 && (
            <Field label={tr('payments.filter.till')}>
              <Select value={filters.till_id} onChange={set('till_id')}>
                <option value="">{tr('common.all')}</option>
                {tills.map((x) => <option key={x.id} value={x.id}>{tillName(x.id)}</option>)}
              </Select>
            </Field>
          )}
          <Field label={tr('payments.filter.q')}><Input value={filters.q} onChange={set('q')} placeholder="AP-…" /></Field>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <Button type="submit">{tr('common.filter')}</Button>
            <Button variant="ghost" onClick={() => { setFilters(EMPTY); setApplied(EMPTY) }}>{tr('common.reset')}</Button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: '6px 18px 14px' }}>
        {!list && !error && <Empty>{tr('common.loading')}</Empty>}
        {list && list.data.length === 0 && <Empty>{tr('payments.empty')}</Empty>}
        {list?.data.map((p) => (
          <ListRow key={p.id} onClick={() => open(p)}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.amount_display}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>
                {OPERATORS[p.operator] ?? p.operator} · {p.payer_phone ?? '—'} · {tillName(p.till_id) ?? tr('payments.noTill')}
              </div>
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{p.reference}</div>
            <div style={{ fontSize: 12, color: t.textMuted, minWidth: 110 }}>{dateTime(p.created_at)}</div>
            <Pill status={p.status} label={tr(`status.${p.status}`)} />
          </ListRow>
        ))}
        {list?.has_more && (
          <div style={{ textAlign: 'center', paddingTop: 12 }}>
            <Button variant="ghost" disabled={busy} onClick={() => load(list.next_cursor)}>{tr('common.more')}</Button>
          </div>
        )}
        <p style={{ fontSize: 12, color: t.textMuted, margin: '12px 0 0' }}>{tr('payments.verifLimit')}</p>
      </Card>

      {can('exports:create') && !locked && <Exports base={base} mode={mode} filters={applied} />}

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.amount_display : ''}>
        {detail && (
          <>
            <Card style={{ marginBottom: 12 }}>
              {[
                [tr('payments.detail.status'), <Pill key="s" status={detail.status} label={tr(`status.${detail.status}`)} />],
                [tr('payments.detail.reference'), detail.reference],
                [tr('payments.detail.operator'), OPERATORS[detail.operator] ?? detail.operator],
                [tr('payments.detail.payer'), detail.payer_phone ?? '—'],
                [tr('payments.detail.till'), tillName(detail.till_id) ?? tr('payments.noTill')],
                [tr('payments.detail.description'), detail.description ?? '—'],
                [tr('payments.detail.providerRef'), detail.provider_reference ?? '—'],
                [tr('payments.detail.created'), dateTime(detail.created_at)],
                ...(detail.failure_reason ? [[tr('payments.detail.failure'), detail.failure_reason]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '7px 0', borderTop: `1px solid ${t.border}`, fontSize: 14 }}>
                  <span style={{ color: t.textMuted, flex: '0 0 130px' }}>{k}</span>
                  <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
                </div>
              ))}
            </Card>
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: '16px 0 8px' }}>{tr('payments.detail.history')}</h3>
            <Card>
              {detail.audit_trail.map((a, i) => (
                <div key={i} style={{ fontSize: 13, padding: '6px 0', borderTop: i ? `1px solid ${t.border}` : 'none' }}>
                  <strong>{a.from ?? '—'} → {a.to}</strong> <span style={{ color: t.textMuted }}>· {dateTime(a.at)}{a.reason ? ` · ${a.reason}` : ''}</span>
                </div>
              ))}
            </Card>
          </>
        )}
      </Drawer>
    </div>
  )
}

/** Exports en tâche de fond : lancés ici, téléchargés quand le worker a fini. */
export function Exports({ base, mode, filters, kind = 'transactions' }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await authApi.get(`${base}/exports`)
      setJobs(res.data.data.filter((j) => j.kind === kind).slice(0, 5))
    } catch (err) {
      if (!isLocked(err)) setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, kind, tr])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Rafraîchit tant qu'un export est en cours.
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'pending' || j.status === 'processing')) return
    const id = setTimeout(refresh, 2000)
    return () => clearTimeout(id)
  }, [jobs, refresh])

  const start = async (format) => {
    setError(null)
    try {
      const body = Object.fromEntries(Object.entries({ ...filters, kind, format }).filter(([k, v]) => v !== '' && v != null && k !== 'q'))
      await authApi.post(`${base}/exports`, body, { params: { mode } })
      await refresh()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <strong style={{ fontSize: 15, flex: 1 }}>{tr(kind === 'reconciliation' ? 'exports.titleRecon' : 'exports.title')}</strong>
        <Button variant="ghost" onClick={() => start('CSV')}>CSV</Button>
        <Button variant="ghost" onClick={() => start('XLSX')}>Excel</Button>
      </div>
      <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 8px' }}>{tr('exports.intro')}</p>
      <ErrorBox error={error} />
      {jobs.map((j) => (
        <ListRow key={j.id}>
          <span style={{ flex: 1, fontSize: 13 }}>{dateTime(j.created_at)} · {j.format === 'XLSX' ? 'Excel' : 'CSV'}{j.row_count != null ? ` · ${fmt(tr('exports.rows'), { n: j.row_count })}` : ''}</span>
          <Pill status={j.status} label={tr(`exports.status.${j.status}`)} />
          {j.status === 'done' && (
            <Button variant="ghost" onClick={() => download(`${base}/exports/${j.id}/download`, `alphapay-${j.kind}.${j.format === 'XLSX' ? 'xlsx' : 'csv'}`)}>
              {tr('common.download')}
            </Button>
          )}
        </ListRow>
      ))}
    </Card>
  )
}
