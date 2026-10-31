import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Card } from '../ui'
import { authApi, errorMessage } from '../auth/session'
import { dateTime, fmt, isLocked, useMerchant } from '../merchant'
import { Empty, ErrorBox, ListRow, ModeSwitch, PageHeader, Pill, Stat, StatGrid } from '../merchantUi'

const OPERATORS = { mtn: 'MTN MoMo', airtel: 'Airtel Money', card: 'Carte' }
const REFRESH_MS = 30_000

/**
 * Accueil (§M6) : indicateurs du jour, de la semaine et du mois, répartition
 * par opérateur, taux d'échec et derniers paiements, sur l'API de session
 * (`/stats`, `/payments`). Un caissier n'a pas les totaux du marchand : il voit
 * les paiements de sa caisse et un accès direct à l'écran Caisse.
 */
export default function DashboardHome() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { membership, base, mode, setMode, canLive, can } = useMerchant()
  const [stats, setStats] = useState(null)
  const [locked, setLocked] = useState(false)
  const [recent, setRecent] = useState(null)
  const [error, setError] = useState(null)
  const manager = can('payments:view')

  const load = useCallback(async () => {
    if (!base) return
    try {
      const res = await authApi.get(`${base}/payments`, { params: { mode, limit: 6 } })
      setRecent(res.data.data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
    if (!manager) return
    try {
      const res = await authApi.get(`${base}/stats`, { params: { mode } })
      setStats(res.data)
      setLocked(false)
    } catch (err) {
      if (isLocked(err)) setLocked(true)
      else setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, mode, manager, tr])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const shortcuts = [
    { to: '/caisse', label: tr('home.go.caisse'), show: true },
    { to: '/links', label: tr('home.go.links'), show: can('paylinks:write') },
    { to: '/invoices', label: tr('home.go.invoices'), show: can('invoices:view') },
    { to: '/reconciliation', label: tr('home.go.reconciliation'), show: can('reconciliation:view') },
  ].filter((s) => s.show)

  return (
    <div>
      <PageHeader title={fmt(tr('home.title'), { name: membership?.name ?? '' })} intro={tr('home.intro')}>
        <ModeSwitch mode={mode} setMode={setMode} canLive={canLive} />
      </PageHeader>
      <ErrorBox error={error} />

      {manager && locked && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14 }}>
            {tr('home.statsLocked')} <Link to="/billing" style={{ color: t.primary, fontWeight: 700 }}>{tr('home.upgrade')} →</Link>
          </div>
        </Card>
      )}
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {shortcuts.map((s) => (
          <Link key={s.to} to={s.to} style={{
            padding: '10px 16px', borderRadius: 9999, background: t.surfaceAlt, color: t.text,
            fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}>{s.label}</Link>
        ))}
      </div>

      <Card style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{tr(manager ? 'home.recent' : 'home.recentTill')}</span>
          <Link to="/payments" style={{ marginLeft: 'auto', color: t.primary, fontSize: 13, fontWeight: 700 }}>{tr('home.all')} →</Link>
        </div>
        {recent && recent.length === 0 && <Empty>{tr('home.none')}</Empty>}
        {recent?.map((p) => (
          <ListRow key={p.id}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.amount_display}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{OPERATORS[p.operator] ?? p.operator} · {p.payer_phone ?? '—'}</div>
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, minWidth: 110 }}>{dateTime(p.created_at)}</div>
            <Pill status={p.status} label={tr(`status.${p.status}`)} />
          </ListRow>
        ))}
        <p style={{ fontSize: 12, color: t.textMuted, margin: '12px 0 0' }}>{tr('payments.verifLimit')}</p>
      </Card>
    </div>
  )
}
