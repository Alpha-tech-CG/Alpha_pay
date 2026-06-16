import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'

const API = '/api'
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
const API_KEY = 'paybrain-key-alpha-educ-2026'
const headers = { 'X-API-Key': API_KEY }

const STATUS_COLOR = {
  PENDING:    '#f59e0b',
  SUCCESSFUL: '#22c55e',
  FAILED:     '#ef4444',
  REJECTED:   '#ef4444',
}
const STATUS_BG = {
  PENDING:    '#2d2208',
  SUCCESSFUL: '#052e16',
  FAILED:     '#2d0b0b',
  REJECTED:   '#2d0b0b',
}

function Badge({ status }) {
  return (
    <span style={{
      background: STATUS_BG[status] || '#1e2433',
      color: STATUS_COLOR[status] || '#94a3b8',
      borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700,
      border: `1px solid ${STATUS_COLOR[status] || '#334155'}`,
    }}>{status}</span>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#1e2433', border: '1px solid #2d3748', borderRadius: 12,
      padding: '20px 24px', flex: 1, minWidth: 160,
    }}>
      <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function App() {
  const [stats, setStats]         = useState({ totals: [], recent: [] })
  const [filter, setFilter]       = useState('ALL')
  const [wsStatus, setWsStatus]   = useState('connecting')
  const [flash, setFlash]         = useState(null)

  const fetchStats = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/stats`, { headers })
      setStats(r.data)
    } catch {}
  }, [])

  useEffect(() => {
    let ws
    function connect() {
      ws = new WebSocket(WS_URL)
      ws.onopen  = () => setWsStatus('connected')
      ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000) }
      ws.onerror = () => setWsStatus('error')
      ws.onmessage = e => {
        const msg = JSON.parse(e.data)
        if (msg.event === 'transaction_update') {
          setFlash(msg.data)
          setTimeout(() => setFlash(null), 4000)
          fetchStats()
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

  const total   = stats.totals.reduce((s, r) => s + Number(r.count), 0)
  const success = stats.totals.find(r => r.status === 'SUCCESSFUL')
  const pending = stats.totals.find(r => r.status === 'PENDING')
  const failed  = stats.totals.reduce((s, r) =>
    r.status === 'FAILED' || r.status === 'REJECTED' ? s + Number(r.count) : s, 0)
  const volume  = success ? Number(success.volume).toLocaleString('fr-FR') : '0'

  const filtered = filter === 'ALL'
    ? stats.recent
    : stats.recent.filter(t => t.status === filter)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>GROUPE ALPHA</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>
            Pay<span style={{ color: '#3b82f6' }}>Brain</span>
            <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b', marginLeft: 12 }}>Dashboard Marchand</span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: wsStatus === 'connected' ? '#22c55e' : '#ef4444',
            boxShadow: wsStatus === 'connected' ? '0 0 8px #22c55e' : 'none',
          }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {wsStatus === 'connected' ? 'Temps réel actif' : 'Reconnexion...'}
          </span>
        </div>
      </div>

      {/* Flash notification webhook */}
      {flash && (
        <div style={{
          background: STATUS_BG[flash.status] || '#1e2433',
          border: `1px solid ${STATUS_COLOR[flash.status] || '#3b82f6'}`,
          borderRadius: 10, padding: '12px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>{flash.status === 'SUCCESSFUL' ? '✅' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 700, color: STATUS_COLOR[flash.status] }}>
              Paiement {flash.status}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {flash.externalId}{flash.reason ? ` — ${flash.reason}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <StatCard label="Total transactions" value={total} sub="toutes périodes" />
        <StatCard label="En attente" value={pending?.count || 0} color="#f59e0b" sub="confirmation client" />
        <StatCard label="Réussies" value={success?.count || 0} color="#22c55e" sub={`Volume : ${volume}`} />
        <StatCard label="Échouées / Rejetées" value={failed} color="#ef4444" sub="MTN sandbox" />
      </div>

      {/* Filtres + table */}
      <div style={{ background: '#1e2433', border: '1px solid #2d3748', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2d3748', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, marginRight: 8 }}>Transactions récentes</span>
          {['ALL','PENDING','SUCCESSFUL','FAILED','REJECTED'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: filter === s ? '#3b82f6' : '#0f1117',
              color: filter === s ? '#fff' : '#64748b',
            }}>{s}</button>
          ))}
          <button onClick={fetchStats} style={{
            marginLeft: 'auto', padding: '4px 14px', borderRadius: 6,
            border: '1px solid #2d3748', cursor: 'pointer',
            fontSize: 12, background: 'transparent', color: '#64748b',
          }}>↻</button>
          <span style={{ fontSize: 12, color: '#64748b' }}>{filtered.length} résultats</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#161b2a' }}>
                {['Marchand','Ext. ID','Montant','Téléphone','Statut','Date'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 1,
                    borderBottom: '1px solid #2d3748',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#334155' }}>
                  Aucune transaction
                </td></tr>
              )}
              {filtered.map((t, i) => (
                <tr key={t.id} style={{
                  borderBottom: '1px solid #1a2035',
                  background: i % 2 === 0 ? 'transparent' : '#191f2e',
                }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#94a3b8' }}>
                    {t.merchant_name || '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
                    {t.external_id}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    {Number(t.amount).toLocaleString('fr-FR')}
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{t.currency}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: '#94a3b8' }}>
                    {t.payer_phone}
                  </td>
                  <td style={{ padding: '10px 16px' }}><Badge status={t.status} /></td>
                  <td style={{ padding: '10px 16px', fontSize: 11, color: '#64748b' }}>
                    {new Date(t.created_at).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 32, textAlign: 'center', color: '#1e2433', fontSize: 11 }}>
        GROUPE ALPHA — DATABRAIN · PayBrain v1.0 · {new Date().getFullYear()}
      </div>
    </div>
  )
}
