import { useEffect, useState, useCallback } from 'react'
import { authApi, errorMessage, useAuth } from '../auth/session'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Card, Button, Field, Input, Badge } from '../ui'

function Mono({ children }) {
  const { t } = useTheme()
  return <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: t.textMuted, wordBreak: 'break-all' }}>{children}</code>
}

const when = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—')

/* ---------------- Clés API (T-56) ---------------- */
function ApiKeysSection({ base }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [keys, setKeys] = useState([])
  const [limit, setLimit] = useState(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState('test')
  const [created, setCreated] = useState(null) // secret affiché une seule fois
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await authApi.get(`${base}/api-keys`)
      setKeys(r.data.data)
      setLimit(r.data.rate_limit_per_minute)
    } catch (err) { setError(errorMessage(err, tr('auth.error.generic'))) }
  }, [base, tr])
  useEffect(() => { load() }, [load])

  const run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn(); await load() } catch (err) { setError(errorMessage(err, tr('auth.error.generic'))) } finally { setBusy(false) }
  }
  const create = () => run(async () => { setCreated((await authApi.post(`${base}/api-keys`, { name, mode })).data); setName('') })
  const rotate = (id) => run(async () => setCreated((await authApi.post(`${base}/api-keys/${id}/rotate`)).data))
  const revoke = (id) => run(() => authApi.delete(`${base}/api-keys/${id}`))

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{tr('dev.keys.title')}</div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>{tr('dev.keys.intro')}{limit ? ` ${tr('dev.keys.limit').replace('{n}', limit)}` : ''}</div>

      {created && (
        <div style={{ background: t.surfaceAlt, border: `1px solid ${t.primary}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{tr('dev.keys.once')}</div>
          <Mono>{created.key}</Mono>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(created.key)}>{tr('dev.copy')}</Button>
            <Button variant="ghost" onClick={() => setCreated(null)}>{tr('dev.keys.copied')}</Button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: '1 1 200px' }}><Field label={tr('dev.keys.name')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('dev.keys.placeholder')} /></Field></div>
        <div style={{ flex: '0 1 120px' }}>
          <Field label={tr('dev.mode')}>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}>
              <option value="test">{tr('dev.mode.test')}</option>
              <option value="live">{tr('dev.mode.live')}</option>
            </select>
          </Field>
        </div>
        <Button onClick={create} disabled={busy || !name}>{tr('dev.keys.create')}</Button>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['dev.keys.name', 'dev.mode', 'dev.keys.prefix', 'dev.keys.lastUsed', 'dev.status', ''].map((h) => (
            <th key={h} style={{ textAlign: 'left', fontSize: 11, color: t.textMuted, padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>{h && tr(h)}</th>
          ))}</tr></thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>{tr('dev.keys.none')}</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td style={{ padding: '8px 10px', fontSize: 13 }}>{k.name}</td>
                <td style={{ padding: '8px 10px' }}><span style={{ fontSize: 11, fontWeight: 700, color: k.mode === 'LIVE' ? '#dc2626' : '#16a34a' }}>{tr(k.mode === 'LIVE' ? 'dev.mode.live' : 'dev.mode.test')}</span></td>
                <td style={{ padding: '8px 10px' }}><Mono>{k.prefix}</Mono></td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: t.textMuted }}>{when(k.lastUsedAt)}</td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{k.revoked ? <span style={{ color: '#dc2626' }}>{tr('dev.keys.revoked')}</span> : <span style={{ color: '#16a34a' }}>{tr('dev.keys.active')}</span>}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {!k.revoked && (
                    <>
                      <button onClick={() => rotate(k.id)} style={linkBtn(t)}>{tr('dev.keys.rotate')}</button>
                      <button onClick={() => revoke(k.id)} style={{ ...linkBtn(t), color: '#dc2626' }}>{tr('dev.keys.revoke')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Webhooks (T-57) ---------------- */
function WebhooksSection({ base, mode }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [endpoints, setEndpoints] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState(['payment.succeeded', 'payment.failed', 'payment.expired'])
  const [logs, setLogs] = useState({}) // endpointId -> livraisons
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const q = `?mode=${mode}`

  const load = useCallback(async () => {
    try {
      const r = await authApi.get(`${base}/webhook-endpoints${q}`)
      setEndpoints(r.data.data)
      setAllEvents(r.data.events)
    } catch (err) { setError(errorMessage(err, tr('auth.error.generic'))) }
  }, [base, q, tr])
  useEffect(() => { load(); setLogs({}) }, [load])

  const loadLogs = async (id) => {
    const r = await authApi.get(`${base}/webhook-endpoints/${id}/deliveries${q}`)
    setLogs((l) => ({ ...l, [id]: r.data.data }))
  }
  const run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn() } catch (err) { setError(errorMessage(err, tr('auth.error.generic'))) } finally { setBusy(false) }
  }
  const toggleEvent = (e) => setEvents((arr) => (arr.includes(e) ? arr.filter((x) => x !== e) : [...arr, e]))
  const create = () => run(async () => { await authApi.post(`${base}/webhook-endpoints${q}`, { url, events }); setUrl(''); await load() })
  const remove = (id) => run(async () => { await authApi.delete(`${base}/webhook-endpoints/${id}${q}`); await load() })
  const toggleStatus = (ep) => run(async () => { await authApi.patch(`${base}/webhook-endpoints/${ep.id}${q}`, { status: ep.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); await load() })
  const test = (id) => run(async () => { await authApi.post(`${base}/webhook-endpoints/${id}/test${q}`); await loadLogs(id) })
  const resend = (id, deliveryId) => run(async () => { await authApi.post(`${base}/webhook-endpoints/${id}/deliveries/${deliveryId}/resend${q}`); await loadLogs(id) })

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{tr('dev.hooks.title')}</div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
        {tr('dev.hooks.intro')} <Mono>AlphaPay-Signature: t=…,v1=…</Mono>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <div style={{ flex: '1 1 260px' }}><Field label={tr('dev.hooks.url')}><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mon-site.cg/webhooks/alphapay" /></Field></div>
        <Button onClick={create} disabled={busy || !url}>{tr('dev.hooks.add')}</Button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        {allEvents.map((e) => (
          <label key={e} style={{ fontSize: 12, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} /> {e}
          </label>
        ))}
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {endpoints.length === 0 && <div style={{ color: t.textMuted, fontSize: 13 }}>{tr('dev.hooks.none')}</div>}
      {endpoints.map((ep) => (
        <div key={ep.id} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Mono>{ep.url}</Mono>
            <span style={{ fontSize: 11, fontWeight: 700, color: ep.status === 'ACTIVE' ? '#16a34a' : t.textMuted }}>{tr(ep.status === 'ACTIVE' ? 'dev.hooks.active' : 'dev.hooks.disabled')}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => test(ep.id)} style={linkBtn(t)}>{tr('dev.hooks.test')}</button>
              <button onClick={() => loadLogs(ep.id)} style={linkBtn(t)}>{tr('dev.hooks.log')}</button>
              <button onClick={() => toggleStatus(ep)} style={linkBtn(t)}>{tr(ep.status === 'ACTIVE' ? 'dev.hooks.disable' : 'dev.hooks.enable')}</button>
              <button onClick={() => remove(ep.id)} style={{ ...linkBtn(t), color: '#dc2626' }}>{tr('dev.hooks.delete')}</button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>{tr('dev.hooks.events')} {ep.events.join(', ') || tr('dev.hooks.allEvents')}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>{tr('dev.hooks.secret')} <Mono>{ep.secret}</Mono></div>

          {logs[ep.id] && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr>{['dev.hooks.col.event', 'dev.status', 'dev.hooks.col.attempts', 'dev.hooks.col.http', 'dev.hooks.col.date', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, color: t.textMuted, padding: '6px 8px', borderBottom: `1px solid ${t.border}` }}>{h && tr(h)}</th>
                ))}</tr></thead>
                <tbody>
                  {logs[ep.id].length === 0 && <tr><td colSpan={6} style={{ padding: 14, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>{tr('dev.hooks.noDelivery')}</td></tr>}
                  {logs[ep.id].map((d) => (
                    <tr key={d.id}>
                      <td style={{ padding: '6px 8px', fontSize: 12 }}>{d.event}</td>
                      <td style={{ padding: '6px 8px' }}><Badge status={d.status === 'SUCCESS' ? 'SUCCESSFUL' : d.status === 'FAILED' ? 'FAILED' : 'PENDING'} /></td>
                      <td style={{ padding: '6px 8px', fontSize: 12 }}>{d.attempts}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, color: t.textMuted }}>{d.responseStatus ?? d.lastError ?? '—'}</td>
                      <td style={{ padding: '6px 8px', fontSize: 11, color: t.textMuted }}>{when(d.createdAt)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}><button onClick={() => resend(ep.id, d.id)} disabled={busy} style={linkBtn(t)}>{tr('dev.hooks.resend')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </Card>
  )
}

/* ---------------- Journal des requêtes API (T-56) ---------------- */
function ApiLogsSection({ base, mode }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [rows, setRows] = useState([])
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [cursor, setCursor] = useState(null)

  const load = useCallback(async (after) => {
    try {
      const r = await authApi.get(`${base}/api-logs`, { params: { mode, status: errorsOnly ? 'errors' : undefined, starting_after: after ?? undefined } })
      setRows((cur) => (after ? [...cur, ...r.data.data] : r.data.data))
      setCursor(r.data.has_more ? r.data.next_cursor : null)
    } catch { /* réservé aux rôles autorisés : section vide sinon */ }
  }, [base, mode, errorsOnly])
  useEffect(() => { load() }, [load])

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{tr('dev.logs.title')}</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{tr('dev.logs.intro')}</div>
        </div>
        <label style={{ fontSize: 12, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> {tr('dev.logs.errors')}
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['dev.logs.col.date', 'dev.logs.col.request', 'dev.status', 'dev.logs.col.duration', 'dev.logs.col.id'].map((h) => (
            <th key={h} style={{ textAlign: 'left', fontSize: 11, color: t.textMuted, padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>{tr(h)}</th>
          ))}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>{tr('dev.logs.none')}</td></tr>}
            {rows.map((l) => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td style={{ padding: '8px 10px', fontSize: 12, color: t.textMuted, whiteSpace: 'nowrap' }}>{when(l.created_at)}</td>
                <td style={{ padding: '8px 10px' }}><Mono>{l.method} {l.path}</Mono></td>
                <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: l.status >= 400 ? '#dc2626' : '#16a34a' }}>{l.status}{l.error_code ? ` · ${l.error_code}` : ''}</td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{l.duration_ms} ms</td>
                <td style={{ padding: '8px 10px' }}><Mono>{l.request_id}</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && <div style={{ marginTop: 10 }}><Button variant="ghost" onClick={() => load(cursor)}>{tr('dev.more')}</Button></div>}
    </Card>
  )
}

function linkBtn(t) {
  return { background: 'transparent', border: 'none', cursor: 'pointer', color: t.primary, fontSize: 12, fontWeight: 600, padding: '2px 6px' }
}

/** Espace Développeurs (§M10) : clés, webhooks, journal, documentation. */
export default function Developers() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user } = useAuth()
  const membership = user?.merchants?.[0]
  const [mode, setMode] = useState('test')
  if (!membership) return null
  const base = `/v1/merchants/${membership.id}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{tr('nav.developers')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/api/docs" target="_blank" rel="noreferrer" style={{ color: t.primary, fontWeight: 700, fontSize: 13 }}>{tr('dev.docs')} ↗</a>
          <select aria-label={tr('dev.mode')} value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}>
            <option value="test">{tr('dev.mode.test')}</option>
            <option value="live">{tr('dev.mode.live')}</option>
          </select>
        </div>
      </div>
      <ApiKeysSection base={base} />
      <WebhooksSection base={base} mode={mode} />
      <ApiLogsSection base={base} mode={mode} />
    </div>
  )
}
