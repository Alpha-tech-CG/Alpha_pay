import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input } from '../ui'
import { authApi, errorMessage, useAuth } from '../auth/session'

const STATUS_COLOR = { ACTIVE: '#16a34a', PENDING: '#d97706', DISABLED: '#64748b', NOT_CONNECTED: '#64748b' }
const OPERATOR_NAME = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money' }

function Pill({ color, children }) {
  return (
    <span style={{ color, background: `${color}1f`, borderRadius: 9999, padding: '3px 11px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

/** Guide pas à pas pour obtenir son accès API chez l'opérateur (§4.3). */
function Guide({ operator }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [open, setOpen] = useState(false)
  const steps = [1, 2, 3, 4, 5].map((n) => tr(`operators.guide.${operator}.${n}`)).filter((s) => !s.startsWith('operators.'))
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', padding: 0, color: t.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        {open ? '– ' : '+ '}
        {tr('operators.guide.title')}
      </button>
      {open && (
        <ol style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, margin: '8px 0 0' }}>
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  )
}

function ConnectionRow({ merchantId, connection, onChange }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const base = `/v1/merchants/${merchantId}/provider-connections/${connection.operator.toLowerCase()}?mode=${connection.mode}`

  const run = async (fn) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fn()
      if (res?.data?.error) setMessage({ error: true, text: res.data.error.message })
      else setMessage({ error: false, text: tr('operators.ok') })
      setEditing(false)
      setValues({})
      await onChange()
    } catch (err) {
      setMessage({ error: true, text: errorMessage(err, tr('auth.error.generic')) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '14px 0', borderTop: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{tr(`operators.mode.${connection.mode}`)}</strong>
        <span style={{ fontSize: 12, color: t.textMuted }}>{tr(`operators.env.${connection.environment}`)}</span>
        <Pill color={STATUS_COLOR[connection.status]}>{tr(`operators.status.${connection.status}`)}</Pill>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setEditing((e) => !e)} disabled={busy}>
            {connection.status === 'NOT_CONNECTED' || connection.status === 'DISABLED' ? tr('operators.connect') : tr('operators.replace')}
          </Button>
          {(connection.status === 'ACTIVE' || connection.status === 'PENDING') && (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => run(() => authApi.post(base.replace('?', '/verify?')))}>{tr('operators.verify')}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => window.confirm(tr('operators.disconnect.confirm')) && run(() => authApi.delete(base))}>
                {tr('operators.disconnect')}
              </Button>
            </>
          )}
        </div>
      </div>

      {connection.callbackUrl && (
        <div style={{ fontSize: 12, marginTop: 8, color: t.textMuted, wordBreak: 'break-all' }}>
          {tr('operators.callback')} <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{connection.callbackUrl}</code>
        </div>
      )}
      {message && <div role="status" style={{ fontSize: 13, marginTop: 8, color: message.error ? '#dc2626' : t.primary }}>{message.text}</div>}

      {editing && (
        <form
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            run(() => authApi.put(base, { credentials: values }))
          }}
        >
          {connection.fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input type="password" autoComplete="off" value={values[f.key] || ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} required />
            </Field>
          ))}
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>{tr('operators.secure')}</div>
          <Button type="submit" disabled={busy}>{tr('operators.saveVerify')}</Button>
        </form>
      )}
    </div>
  )
}

/** Comptes opérateur du marchand : les paiements arrivent sur SES comptes MTN et Airtel. */
export default function Operators() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user } = useAuth()
  const membership = user?.merchants?.[0]
  const [connections, setConnections] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!membership) return
    try {
      const res = await authApi.get(`/v1/merchants/${membership.id}/provider-connections`)
      setConnections(res.data.data)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    }
  }, [membership, tr])

  useEffect(() => {
    load()
  }, [load])

  if (!membership) return null
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return <Card>{tr('operators.forbidden')}</Card>
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{tr('operators.title')}</h1>
      <p style={{ fontSize: 14, color: t.textMuted, marginTop: 0, marginBottom: 18 }}>{tr('operators.intro')}</p>
      {error && <div role="alert" style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
      {!connections && !error && <div>{tr('common.loading')}</div>}
      {connections &&
        ['MTN', 'AIRTEL'].map((operator) => (
          <Card key={operator} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{OPERATOR_NAME[operator]}</div>
            <Guide operator={operator} />
            {connections
              .filter((c) => c.operator === operator)
              .map((c) => (
                <ConnectionRow key={c.mode} merchantId={membership.id} connection={c} onChange={load} />
              ))}
          </Card>
        ))}
    </div>
  )
}
