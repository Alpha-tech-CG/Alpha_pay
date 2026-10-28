import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card } from '../ui'
import { authApi, errorMessage, useAuth } from '../auth/session'

const MONO = "'JetBrains Mono', ui-monospace, monospace"

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Écran Caisse (§M5) : paiements du jour en direct, gros affichage du dernier
 * paiement. Flux SSE ouvert avec un ticket à usage unique, rouvert en cas de
 * coupure ; notifications web push en option.
 */
export default function Caisse() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user } = useAuth()
  const membership = user?.merchants?.[0]
  const livemode = membership?.kybStatus === 'APPROVED'
  const base = membership ? `/v1/merchants/${membership.id}/verif` : null

  const [day, setDay] = useState(null)
  const [latest, setLatest] = useState(null)
  const [flash, setFlash] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState(null)
  const [push, setPush] = useState({ state: 'unknown' })
  const sourceRef = useRef(null)

  const load = useCallback(async () => {
    if (!base) return
    try {
      const res = await authApi.get(`${base}/today`, { params: { mode: livemode ? 'live' : 'test' } })
      setDay(res.data)
      setLatest((cur) => cur ?? res.data.data[0] ?? null)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [base, livemode, tr])

  // Flux temps réel : nouveau ticket à chaque (re)connexion.
  useEffect(() => {
    if (!base) return undefined
    let stopped = false
    let retry
    const connect = async () => {
      try {
        const { data } = await authApi.post(`${base}/stream-ticket`)
        if (stopped) return
        const es = new EventSource(`/api/v1/verif/stream?ticket=${encodeURIComponent(data.ticket)}`)
        sourceRef.current = es
        es.addEventListener('ready', () => setLive(true))
        es.addEventListener('payment', (e) => {
          const { payment } = JSON.parse(e.data)
          if (payment.livemode !== livemode) return
          setLatest(payment)
          setFlash(true)
          setTimeout(() => setFlash(false), 2500)
          setDay((d) => (d && !d.data.some((p) => p.id === payment.id)
            ? { ...d, count: d.count + 1, total: d.total + payment.amount, data: [payment, ...d.data] }
            : d))
        })
        es.onerror = () => {
          setLive(false)
          es.close()
          if (!stopped) retry = setTimeout(connect, 3000)
        }
      } catch {
        if (!stopped) retry = setTimeout(connect, 5000)
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      sourceRef.current?.close()
    }
  }, [base, livemode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setPush({ state: 'unsupported' })
    if (Notification.permission === 'denied') return setPush({ state: 'denied' })
    navigator.serviceWorker.getRegistration('/sw.js').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription()
      setPush({ state: sub ? 'on' : 'off' })
    })
  }, [])

  const enablePush = async () => {
    setPush({ state: 'busy' })
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return setPush({ state: 'denied' })
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const { data } = await authApi.get(`${base}/push/config`)
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.public_key) })
      await authApi.post(`${base}/push-subscriptions`, sub.toJSON())
      setPush({ state: 'on' })
    } catch (err) {
      setPush({ state: 'off', error: errorMessage(err, tr('caisse.push.error')) })
    }
  }

  if (!membership) return null
  const ok = '#0F9D58'

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{tr('caisse.title')}</h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: live ? ok : t.textMuted }}>
          ● {live ? tr('caisse.live') : tr('caisse.offline')}{!livemode && ` · ${tr('caisse.testmode')}`}
        </span>
      </div>

      <Card style={{ textAlign: 'center', padding: '28px 20px', transition: 'background .4s', background: flash ? '#E6F6EC' : undefined }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('caisse.latest')}</div>
        {latest ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: 'clamp(40px, 11vw, 64px)', fontWeight: 600, color: ok, margin: '8px 0 4px' }}>{latest.amount_display}</div>
            <div style={{ fontSize: 15 }}>
              {latest.operator.toUpperCase()} · {latest.payer} · {time(latest.at)}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: t.textMuted, marginTop: 4 }}>
              {tr('caisse.ref')} {latest.ref}{latest.till_name ? ` · ${latest.till_name}` : ''}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 15, color: t.textMuted, margin: '18px 0' }}>{tr('caisse.waiting')}</div>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 12, margin: '14px 0', flexWrap: 'wrap' }}>
        <Card style={{ flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{tr('caisse.today.count')}</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{day?.count ?? '–'}</div>
        </Card>
        <Card style={{ flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{tr('caisse.today.total')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: MONO }}>{day ? `${day.total.toLocaleString('fr-FR')} XAF` : '–'}</div>
        </Card>
      </div>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{tr('caisse.list')}</div>
        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
        {day && day.data.length === 0 && <div style={{ fontSize: 14, color: t.textMuted }}>{tr('caisse.empty')}</div>}
        {day?.data.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${t.border}` }}>
            <div>
              <div style={{ fontWeight: 600 }}>{p.payer ?? '–'}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>
                {time(p.at)} · {p.operator.toUpperCase()} · {p.ref}{p.till_name ? ` · ${p.till_name}` : ''}
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.amount_display}</div>
          </div>
        ))}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14 }}>{tr(`caisse.push.${push.state}`)}</div>
          {(push.state === 'off' || push.state === 'unknown') && <Button onClick={enablePush}>{tr('caisse.push.enable')}</Button>}
        </div>
        {push.error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>{push.error}</div>}
      </Card>

      <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginTop: 14 }}>ⓘ {tr('caisse.notice')}</p>
    </div>
  )
}
