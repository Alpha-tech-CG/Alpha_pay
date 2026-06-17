import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { useTheme } from '../theme'
import { Card, Button, Field, Input, Badge } from '../ui'

const EVENTS = ['payment.succeeded', 'payment.failed', 'payment.pending']

function Mono({ children }) {
  const { t } = useTheme()
  return <code style={{ fontFamily: 'monospace', fontSize: 12, color: t.textMuted, wordBreak: 'break-all' }}>{children}</code>
}

/* ---------------- API keys ---------------- */
function ApiKeysSection() {
  const { t } = useTheme()
  const [keys, setKeys] = useState([])
  const [name, setName] = useState('')
  const [mode, setMode] = useState('test')
  const [created, setCreated] = useState(null) // secret affiché une seule fois
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setKeys((await api.get('/v1/api-keys')).data) } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!name) return
    setBusy(true)
    try {
      const r = await api.post('/v1/api-keys', { name, mode })
      setCreated(r.data)
      setName('')
      load()
    } finally { setBusy(false) }
  }
  const revoke = async (id) => { await api.delete(`/v1/api-keys/${id}`); load() }
  const rotate = async (id) => { const r = await api.post(`/v1/api-keys/${id}/rotate`); setCreated(r.data); load() }

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Clés API</div>

      {created && (
        <div style={{ background: t.surfaceAlt, border: `1px solid ${t.primary}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⚠️ Copie cette clé maintenant — elle ne sera plus affichée :</div>
          <Mono>{created.key}</Mono>
          <div style={{ marginTop: 10 }}><Button variant="ghost" onClick={() => setCreated(null)}>J’ai copié</Button></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
        <div style={{ flex: '1 1 200px' }}><Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Serveur de prod" /></Field></div>
        <div style={{ flex: '0 1 120px' }}>
          <Field label="Mode">
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}>
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </Field>
        </div>
        <Button onClick={create} disabled={busy || !name}>Créer une clé</Button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Nom', 'Mode', 'Préfixe', 'Dernier usage', 'Statut', ''].map((h) => (
          <th key={h} style={{ textAlign: 'left', fontSize: 11, color: t.textMuted, padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>{h}</th>
        ))}</tr></thead>
        <tbody>
          {keys.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>Aucune clé</td></tr>}
          {keys.map((k) => (
            <tr key={k.id} style={{ borderBottom: `1px solid ${t.border}` }}>
              <td style={{ padding: '8px 10px', fontSize: 13 }}>{k.name}</td>
              <td style={{ padding: '8px 10px' }}><span style={{ fontSize: 11, fontWeight: 700, color: k.mode === 'LIVE' ? '#dc2626' : '#16a34a' }}>{k.mode}</span></td>
              <td style={{ padding: '8px 10px' }}><Mono>{k.prefix}</Mono></td>
              <td style={{ padding: '8px 10px', fontSize: 12, color: t.textMuted }}>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('fr-FR') : '—'}</td>
              <td style={{ padding: '8px 10px', fontSize: 12 }}>{k.revoked ? <span style={{ color: '#dc2626' }}>révoquée</span> : <span style={{ color: '#16a34a' }}>active</span>}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                {!k.revoked && (
                  <>
                    <button onClick={() => rotate(k.id)} style={linkBtn(t)}>Rotation</button>
                    <button onClick={() => revoke(k.id)} style={{ ...linkBtn(t), color: '#dc2626' }}>Révoquer</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/* ---------------- Webhooks ---------------- */
function WebhooksSection() {
  const { t } = useTheme()
  const [endpoints, setEndpoints] = useState([])
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState(['payment.succeeded'])
  const [logs, setLogs] = useState({}) // endpointId -> deliveries[]
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setEndpoints((await api.get('/v1/webhook-endpoints')).data) } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  const toggleEvent = (e) => setEvents((arr) => (arr.includes(e) ? arr.filter((x) => x !== e) : [...arr, e]))
  const create = async () => {
    if (!url) return
    setBusy(true)
    try { await api.post('/v1/webhook-endpoints', { url, events }); setUrl(''); load() }
    catch { /* ignore */ } finally { setBusy(false) }
  }
  const remove = async (id) => { await api.delete(`/v1/webhook-endpoints/${id}`); load() }
  const toggleStatus = async (ep) => { await api.patch(`/v1/webhook-endpoints/${ep.id}`, { status: ep.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); load() }
  const test = async (id) => { await api.post(`/v1/webhook-endpoints/${id}/test`); loadLogs(id) }
  const loadLogs = async (id) => {
    const r = await api.get(`/v1/webhook-endpoints/${id}/deliveries`)
    setLogs((l) => ({ ...l, [id]: r.data }))
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Webhooks sortants</div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>
        Chaque requête est signée : header <Mono>X-Signature-256</Mono> = HMAC-SHA256(<Mono>{'`${X-Timestamp}.${body}`'}</Mono>) avec le secret de l’endpoint.
        Vérifie aussi <Mono>X-Webhook-Id</Mono> (idempotence) et <Mono>X-Timestamp</Mono> (anti-replay).
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <div style={{ flex: '1 1 260px' }}><Field label="URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mon-site.cg/webhooks" /></Field></div>
        <Button onClick={create} disabled={busy || !url}>Ajouter</Button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        {EVENTS.map((e) => (
          <label key={e} style={{ fontSize: 12, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} /> {e}
          </label>
        ))}
      </div>

      {endpoints.length === 0 && <div style={{ color: t.textMuted, fontSize: 13 }}>Aucun endpoint configuré.</div>}
      {endpoints.map((ep) => (
        <div key={ep.id} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Mono>{ep.url}</Mono>
            <span style={{ fontSize: 11, fontWeight: 700, color: ep.status === 'ACTIVE' ? '#16a34a' : t.textMuted }}>{ep.status}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => test(ep.id)} style={linkBtn(t)}>Tester</button>
              <button onClick={() => loadLogs(ep.id)} style={linkBtn(t)}>Logs</button>
              <button onClick={() => toggleStatus(ep)} style={linkBtn(t)}>{ep.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => remove(ep.id)} style={{ ...linkBtn(t), color: '#dc2626' }}>Supprimer</button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>Événements : {ep.events.join(', ') || '—'}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Secret de signature : <Mono>{ep.secret}</Mono></div>

          {logs[ep.id] && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead><tr>{['Event', 'Statut', 'Essais', 'HTTP', 'Date'].map((h) => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, color: t.textMuted, padding: '6px 8px', borderBottom: `1px solid ${t.border}` }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {logs[ep.id].length === 0 && <tr><td colSpan={5} style={{ padding: 14, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>Aucune tentative</td></tr>}
                {logs[ep.id].map((d) => (
                  <tr key={d.id}>
                    <td style={{ padding: '6px 8px', fontSize: 12 }}>{d.event}</td>
                    <td style={{ padding: '6px 8px' }}><Badge status={d.status === 'SUCCESS' ? 'SUCCESSFUL' : d.status === 'FAILED' ? 'FAILED' : 'PENDING'} /></td>
                    <td style={{ padding: '6px 8px', fontSize: 12 }}>{d.attempts}</td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: t.textMuted }}>{d.responseStatus ?? '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 11, color: t.textMuted }}>{new Date(d.createdAt).toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </Card>
  )
}

function linkBtn(t) {
  return { background: 'transparent', border: 'none', cursor: 'pointer', color: t.primary, fontSize: 12, fontWeight: 600, padding: '2px 6px' }
}

export default function Developers() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Développeurs</h1>
      <ApiKeysSection />
      <WebhooksSection />
    </div>
  )
}
