import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { QRCodeSVG } from 'qrcode.react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Card, Button, Field, Input, Select, Badge } from '../ui'

const API = '/api'
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
// La clé API marchand est injectée par le proxy (jamais dans le navigateur).
// On ne garde ici que les en-têtes non sensibles (ex. Idempotency-Key au POST).
const headers = {}

function StatCard({ label, value, sub, color }) {
  const { t } = useTheme()
  return (
    <Card style={{ flex: 1, minWidth: 160 }}>
      <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || t.text }}>{value}</div>
      {sub && <div style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </Card>
  )
}

// Hero card façon Stitch : volume total encaissé (émeraude) + ventilation opérateur.
function HeroBalance({ volume, byOperator }) {
  const { t } = useTheme()
  const op = (name) => byOperator.find((o) => o.operator === name)
  const sub = (name, label) => {
    const o = op(name)
    return (
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', opacity: 0.9 }} />{label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{(o ? Number(o.volume) : 0).toLocaleString('fr-FR')}</div>
      </div>
    )
  }
  return (
    <div style={{
      background: `linear-gradient(135deg, ${t.primary} 0%, #047857 100%)`, color: '#fff',
      borderRadius: 18, padding: '22px 24px', marginBottom: 24,
      boxShadow: '0 10px 24px rgba(5,150,105,0.18)',
    }}>
      <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase' }}>Volume total encaissé</div>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', margin: '6px 0 4px' }}>{volume}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 16 }}>transactions réussies · toutes devises</div>
      <div style={{ display: 'flex', gap: 12 }}>
        {sub('MTN', 'MTN MoMo')}
        {sub('AIRTEL', 'Airtel Money')}
      </div>
    </div>
  )
}

function PaymentForm({ onPaymentInitiated }) {
  const [form, setForm] = useState({ amount: '', currency: 'EUR', phone: '', externalId: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const update = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(null)
    try {
      const r = await axios.post(`${API}/payments`, {
        amount: Number(form.amount), currency: form.currency, phone: form.phone,
        externalId: form.externalId, description: form.description || undefined,
      }, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() } })
      setSuccess(r.data)
      setForm({ amount: '', currency: 'EUR', phone: '', externalId: '', description: '' })
      onPaymentInitiated()
    } catch (err) {
      setError(err.response?.data?.message || 'Échec de l’initiation du paiement')
    } finally { setSubmitting(false) }
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Initier un paiement</div>
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}><Field label="Téléphone"><Input value={form.phone} onChange={update('phone')} placeholder="+242066123456" required /></Field></div>
          <div style={{ flex: '1 1 120px' }}><Field label="Montant"><Input type="number" min="1" value={form.amount} onChange={update('amount')} placeholder="1000" required /></Field></div>
          <div style={{ flex: '0 1 110px' }}><Field label="Devise"><Select value={form.currency} onChange={update('currency')}><option>EUR</option><option>XAF</option><option>USD</option></Select></Field></div>
          <div style={{ flex: '1 1 160px' }}><Field label="ID externe"><Input value={form.externalId} onChange={update('externalId')} placeholder="commande-001" required /></Field></div>
          <div style={{ flex: '2 1 220px' }}><Field label="Description (optionnel)"><Input value={form.description} onChange={update('description')} placeholder="Frais d’inscription" /></Field></div>
        </div>
        <Button type="submit" disabled={submitting}>{submitting ? 'Envoi…' : 'Initier le paiement'}</Button>
      </form>
      {error && <div style={{ marginTop: 16, color: '#dc2626', fontSize: 13 }}>⚠️ {error}</div>}
      {success && <div style={{ marginTop: 16, color: '#16a34a', fontSize: 13 }}>✅ Paiement initié — {success.operator}, {success.status}, réf. {success.referenceId}</div>}
    </Card>
  )
}

function PaylinkForm() {
  const [form, setForm] = useState({ amount: '', currency: 'EUR', description: '', expiresInMinutes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [link, setLink] = useState(null)
  const update = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true); setError(null); setLink(null)
    try {
      const r = await axios.post(`${API}/paylinks`, {
        amount: Number(form.amount), currency: form.currency, description: form.description,
        expiresInMinutes: form.expiresInMinutes ? Number(form.expiresInMinutes) : undefined,
      }, { headers })
      setLink(r.data)
      setForm({ amount: '', currency: 'EUR', description: '', expiresInMinutes: '' })
    } catch (err) {
      setError(err.response?.data?.message || 'Échec de la création du lien')
    } finally { setSubmitting(false) }
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Créer un lien de paiement</div>
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px' }}><Field label="Montant"><Input type="number" min="1" value={form.amount} onChange={update('amount')} placeholder="1000" required /></Field></div>
          <div style={{ flex: '0 1 110px' }}><Field label="Devise"><Select value={form.currency} onChange={update('currency')}><option>EUR</option><option>XAF</option><option>USD</option></Select></Field></div>
          <div style={{ flex: '2 1 220px' }}><Field label="Description"><Input value={form.description} onChange={update('description')} placeholder="Frais d’inscription" required /></Field></div>
          <div style={{ flex: '1 1 140px' }}><Field label="Expiration (min)"><Input type="number" min="1" value={form.expiresInMinutes} onChange={update('expiresInMinutes')} placeholder="60" /></Field></div>
        </div>
        <Button type="submit" disabled={submitting}>{submitting ? 'Création…' : 'Créer le lien'}</Button>
      </form>
      {error && <div style={{ marginTop: 16, color: '#dc2626', fontSize: 13 }}>⚠️ {error}</div>}
      {link && (
        <div style={{ marginTop: 16, fontSize: 13 }}>
          <div style={{ color: '#16a34a', marginBottom: 6 }}>✅ Lien créé</div>
          <a href={link.url} target="_blank" rel="noreferrer" style={{ color: '#3b56f0', wordBreak: 'break-all' }}>{link.url}</a>
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 8, padding: 12, display: 'inline-block' }}>
            <QRCodeSVG value={link.url} size={140} />
          </div>
        </div>
      )}
    </Card>
  )
}

export default function DashboardHome() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [stats, setStats] = useState({ totals: [], recent: [], byOperator: [] })
  const [filter, setFilter] = useState('ALL')
  const [wsStatus, setWsStatus] = useState('connecting')
  const [flash, setFlash] = useState(null)

  const fetchStats = useCallback(async () => {
    try { const r = await axios.get(`${API}/stats`, { headers }); setStats(r.data) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let ws
    function connect() {
      ws = new WebSocket(WS_URL)
      ws.onopen = () => setWsStatus('connected')
      ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000) }
      ws.onerror = () => setWsStatus('error')
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.event === 'transaction_update') {
          setFlash(msg.data); setTimeout(() => setFlash(null), 4000); fetchStats()
        }
      }
    }
    connect()
    return () => ws && ws.close()
  }, [fetchStats])

  useEffect(() => {
    fetchStats()
    const id = setInterval(fetchStats, 15000)
    return () => clearInterval(id)
  }, [fetchStats])

  const total = stats.totals.reduce((s, r) => s + Number(r.count), 0)
  const success = stats.totals.find((r) => r.status === 'SUCCESSFUL')
  const pending = stats.totals.find((r) => r.status === 'PENDING')
  const failed = stats.totals.reduce((s, r) => (r.status === 'FAILED' || r.status === 'REJECTED' ? s + Number(r.count) : s), 0)
  const volume = success ? Number(success.volume).toLocaleString('fr-FR') : '0'
  const filtered = filter === 'ALL' ? stats.recent : stats.recent.filter((x) => x.status === filter)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: wsStatus === 'connected' ? '#16a34a' : '#dc2626' }} />
        <span style={{ fontSize: 12, color: t.textMuted }}>{wsStatus === 'connected' ? tr('dash.realtime') : tr('dash.reconnecting')}</span>
      </div>

      {flash && (
        <Card style={{ marginBottom: 20, borderColor: t.status[flash.status] || t.primary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>{flash.status === 'SUCCESSFUL' ? '✅' : '⚠️'}</span>
            <div>
              <div style={{ fontWeight: 700, color: t.status[flash.status] }}>Paiement {flash.status}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{flash.externalId}{flash.reason ? ` — ${flash.reason}` : ''}</div>
            </div>
          </div>
        </Card>
      )}

      <HeroBalance volume={volume} byOperator={stats.byOperator || []} />

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total transactions" value={total} sub="toutes périodes" />
        <StatCard label="En attente" value={pending?.count || 0} color="#d97706" sub="confirmation client" />
        <StatCard label="Réussies" value={success?.count || 0} color="#16a34a" sub={`Volume : ${volume}`} />
        <StatCard label="Échouées / Rejetées" value={failed} color="#dc2626" sub="MTN sandbox" />
      </div>

      <PaymentForm onPaymentInitiated={fetchStats} />
      <PaylinkForm />

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Transactions récentes</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: t.textMuted }}>{filtered.length} résultats</span>
          <div style={{ flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {['ALL', 'PENDING', 'SUCCESSFUL', 'FAILED', 'REJECTED'].map((s) => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '5px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: filter === s ? t.primary : t.surfaceAlt, color: filter === s ? t.primaryText : t.textMuted,
              }}>{s === 'ALL' ? 'Tout' : <Badge status={s} />}</button>
            ))}
          </div>
        </div>
        <div>
          {filtered.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: t.textMuted, fontSize: 14 }}>Aucune transaction</div>
          )}
          {filtered.map((x) => (
            <div key={x.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
              borderBottom: `1px solid ${t.border}`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: `${t.status[x.status] || t.primary}1f`, color: t.status[x.status] || t.primary,
                display: 'grid', placeItems: 'center', fontSize: 17,
              }}>{x.status === 'SUCCESSFUL' ? '✓' : x.status === 'PENDING' ? '⏳' : '✕'}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.merchantName || 'Marchand'}</div>
                <div style={{ fontSize: 12, color: t.textMuted, fontFamily: 'monospace' }}>{x.externalId}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
                  {Number(x.amount).toLocaleString('fr-FR')}<span style={{ fontSize: 11, color: t.textMuted, marginLeft: 3 }}>{x.currency}</span>
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{new Date(x.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div style={{ flexShrink: 0 }}><Badge status={x.status} /></div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
