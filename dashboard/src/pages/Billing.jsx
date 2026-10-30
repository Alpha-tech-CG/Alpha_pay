import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card } from '../ui'
import { authApi, errorMessage, useAuth } from '../auth/session'

function Pill({ color, children }) {
  return (
    <span style={{ color, background: `${color}1f`, borderRadius: 9999, padding: '3px 11px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

const STATUS_COLOR = { active: '#16a34a', gratuit: '#64748b', grace: '#d97706', expired: '#dc2626', canceled: '#64748b' }

function money(amount, currency) {
  return `${Number(amount).toLocaleString('fr-FR')} ${currency}`
}

/**
 * Facturation AlphaPay (§M11) : palier, modules (verrouillés visibles), crédits de
 * messages et factures. Les factures se règlent par MTN ou Airtel sur la page de
 * paiement AlphaPay ; rien n'est accordé avant le paiement. Seul le propriétaire
 * achète (le serveur revérifie).
 */
export default function Billing() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user } = useAuth()
  const membership = user?.merchants?.[0]
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const base = membership ? `/v1/merchants/${membership.id}/billing` : null

  const load = useCallback(async () => {
    if (!base) return
    try {
      const [subscription, plans, modules, credits, packs, invoices] = await Promise.all([
        authApi.get(`${base}/subscription`),
        authApi.get(`${base}/plans`),
        authApi.get(`${base}/modules`),
        authApi.get(`${base}/credits`),
        authApi.get(`${base}/credits/packs`),
        authApi.get(`${base}/invoices`),
      ])
      setData({
        subscription: subscription.data,
        plans: plans.data,
        // La facturation elle-même reste toujours accessible : ce n'est pas un module vendu.
        modules: modules.data.data.filter((m) => m.key !== 'm11_billing'),
        balance: credits.data.balance,
        packs: packs.data,
        invoices: invoices.data,
      })
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, tr])

  useEffect(() => {
    load()
  }, [load])

  // Achat (palier ou pack) : la facture est créée puis réglée sur la page de paiement.
  const buy = async (path, body) => {
    setBusy(true)
    setError(null)
    try {
      const res = await authApi.post(`${base}/${path}`, body)
      if (res.data.invoice?.payment_url) window.open(res.data.invoice.payment_url, '_blank', 'noopener')
      await load()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  if (!membership) return null
  const isOwner = membership.role === 'OWNER'
  const sub = data?.subscription
  const currentPlan = sub?.plan?.code

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{tr('billing.title')}</h1>
      <p style={{ fontSize: 14, color: t.textMuted, marginTop: 0, marginBottom: 18 }}>{tr('billing.intro')}</p>
      {error && <div role="alert" style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
      {!data && !error && <div>{tr('common.loading')}</div>}

      {data && (
        <>
          {sub.read_only && (
            <div role="status" style={{ background: '#FDE2E1', color: '#7F1D1D', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
              {tr('billing.readonly')}
            </div>
          )}

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: t.textMuted }}>{tr('billing.current')}</div>
              <strong style={{ fontSize: 18 }}>{sub.plan?.label ?? '—'}</strong>
              <Pill color={STATUS_COLOR[sub.status] ?? '#64748b'}>{tr(`billing.status.${sub.status}`)}</Pill>
              {sub.period_end && (
                <span style={{ fontSize: 13, color: t.textMuted }}>
                  {tr('billing.periodEnd')} {new Date(sub.period_end).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
            {sub.pending_invoice && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14 }}>
                  {tr('billing.pending')} <strong>{sub.pending_invoice.amount_display}</strong>
                </span>
                {sub.pending_invoice.payment_url && (
                  <a href={sub.pending_invoice.payment_url} target="_blank" rel="noopener noreferrer" style={{ color: t.primary, fontWeight: 700, fontSize: 14 }}>
                    {tr('billing.pay')} →
                  </a>
                )}
              </div>
            )}
          </Card>

          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '22px 0 10px' }}>{tr('billing.modules')}</h2>
          <Card style={{ marginBottom: 16 }}>
            {data.modules.map((m) => {
              const state = !m.allowed ? 'locked' : m.readonly ? 'readonly' : 'open'
              const color = { open: '#16a34a', readonly: '#d97706', locked: '#64748b' }[state]
              return (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 14, flex: 1 }}>{m.label}</span>
                  <Pill color={color}>{tr(`billing.module.${state}`)}</Pill>
                </div>
              )
            })}
            {data.modules.some((m) => !m.allowed) && (
              <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 0 }}>{tr('billing.upgrade')}</p>
            )}
          </Card>

          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '22px 0 10px' }}>{tr('billing.plans')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
            {data.plans.map((p) => {
              const unpriced = p.price_monthly === 0 && p.code !== 'gratuit'
              return (
                <Card key={p.code} style={{ border: p.code === currentPlan ? `2px solid ${t.primary}` : undefined }}>
                  <strong style={{ fontSize: 16 }}>{p.label}</strong>
                  <div style={{ fontSize: 20, fontWeight: 800, margin: '6px 0' }}>
                    {unpriced ? tr('billing.quote') : p.price_monthly === 0 ? tr('billing.free') : `${money(p.price_monthly, p.currency)} ${tr('billing.perMonth')}`}
                  </div>
                  <ul style={{ fontSize: 13, color: t.textMuted, paddingLeft: 18, margin: '0 0 12px' }}>
                    <li>{p.limits.stores == null ? tr('billing.limit.storesUnlimited') : `${p.limits.stores} ${tr('billing.limit.stores')}`}</li>
                    <li>{p.limits.tills == null ? tr('billing.limit.tillsUnlimited') : `${p.limits.tills} ${tr('billing.limit.tills')}`}</li>
                    {p.included_credits > 0 && <li>{p.included_credits} {tr('billing.limit.credits')}</li>}
                  </ul>
                  {p.code === currentPlan ? (
                    <Pill color={t.primary}>{tr('billing.yourPlan')}</Pill>
                  ) : (
                    isOwner && !unpriced && (
                      <Button disabled={busy} onClick={() => buy('subscribe', { plan: p.code })}>{tr('billing.choose')}</Button>
                    )
                  )}
                </Card>
              )
            })}
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '22px 0 10px' }}>{tr('billing.credits')}</h2>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14 }}>
              {tr('billing.balance')} <strong style={{ fontSize: 18 }}>{data.balance}</strong>
            </div>
            {data.packs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {data.packs.map((pk) => (
                  <Button key={pk.code} variant="ghost" disabled={busy || !isOwner} onClick={() => buy('credits/purchase', { pack: pk.code })}>
                    {pk.credits} {tr('billing.limit.credits')} · {money(pk.price, pk.currency)}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '22px 0 10px' }}>{tr('billing.invoices')}</h2>
          <Card>
            {data.invoices.length === 0 && <div style={{ fontSize: 14, color: t.textMuted }}>{tr('billing.noInvoice')}</div>}
            {data.invoices.map((inv) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${t.border}`, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, flex: 1 }}>{tr(`billing.kind.${inv.kind}`)}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{inv.amount_display}</span>
                <Pill color={inv.status === 'payée' ? '#16a34a' : inv.status === 'annulée' ? '#64748b' : '#d97706'}>{tr(`billing.invoice.${inv.status}`)}</Pill>
                {inv.payment_url && (
                  <a href={inv.payment_url} target="_blank" rel="noopener noreferrer" style={{ color: t.primary, fontWeight: 700, fontSize: 13 }}>
                    {tr('billing.pay')}
                  </a>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
