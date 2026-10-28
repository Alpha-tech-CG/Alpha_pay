import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input } from '../ui'
import { authApi, errorMessage, useAuth } from '../auth/session'

const FIELDS = [
  ['legalName', 'company', 'legal_name'],
  ['legalForm', 'company', 'legal_form'],
  ['rccm', 'company', 'rccm'],
  ['niu', 'company', 'niu'],
  ['address', 'company', 'address'],
  ['sector', 'company', 'sector'],
  ['directorFirstName', 'director', 'first_name'],
  ['directorLastName', 'director', 'last_name'],
]
const DOCS = ['RCCM_EXTRACT', 'NIU_CERTIFICATE', 'DIRECTOR_ID']
const STATUS_COLOR = { brouillon: '#64748b', soumis: '#0284c7', en_revue: '#0284c7', approuvé: '#16a34a', infos_requises: '#d97706', refusé: '#dc2626' }

/** Dossier entreprise (§M2) : informations, pièces, identité du dirigeant, soumission et suivi. */
export default function Kyb() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user, refreshUser } = useAuth()
  const membership = user?.merchants?.[0]
  const base = membership ? `/v1/merchants/${membership.id}/kyb` : null
  const [app, setApp] = useState(null)
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const apply = (data) => {
    setApp(data)
    setForm(Object.fromEntries(FIELDS.map(([k, group, field]) => [k, data[group][field] ?? ''])))
  }
  const load = useCallback(async () => {
    if (!base) return
    try { apply((await authApi.get(base)).data) } catch (err) { setMessage({ error: true, text: errorMessage(err, tr('auth.error.generic')) }) }
  }, [base, tr])
  useEffect(() => { load() }, [load])

  const run = async (fn, ok) => {
    setBusy(true); setMessage(null)
    try {
      const res = await fn()
      if (res?.data?.object === 'kyb_application') apply(res.data)
      if (ok) setMessage({ error: false, text: ok })
      return res
    } catch (err) { setMessage({ error: true, text: errorMessage(err, tr('auth.error.generic')) }) } finally { setBusy(false) }
  }
  const save = () => run(() => authApi.patch(base, form), tr('kyb.saved'))
  const upload = (type, file) => {
    if (!file) return
    const data = new FormData()
    data.append('file', file)
    return run(() => authApi.post(`${base}/documents/${type}`, data), tr('kyb.uploaded'))
  }
  const view = async (id) => {
    const res = await run(() => authApi.get(`${base}/documents/${id}/url`))
    if (res?.data?.url) window.open(res.data.url, '_blank', 'noopener')
  }
  const startKyc = async () => {
    const res = await run(() => authApi.post(`${base}/kyc`))
    if (res?.data?.url) window.open(res.data.url, '_blank', 'noopener')
  }
  const submit = async () => {
    await run(() => authApi.post(`${base}/submit`), tr('kyb.submitted'))
    refreshUser?.()
  }

  if (!membership || !app) return <div style={{ color: t.textMuted }}>{message?.text ?? tr('common.loading')}</div>
  const editable = app.editable && !busy
  const docOf = (type) => app.documents.find((d) => d.type === type)

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{tr('kyb.title')}</h1>
        <span style={{ color: STATUS_COLOR[app.status], background: `${STATUS_COLOR[app.status]}1f`, borderRadius: 9999, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
          {tr(`kyb.status.${app.status}`)}
        </span>
      </div>
      <p style={{ fontSize: 14, color: t.textMuted, marginTop: 0 }}>{tr(app.live_enabled ? 'kyb.intro.live' : 'kyb.intro')}</p>

      {app.decision_reason && app.status !== 'approuvé' && (
        <Card style={{ borderLeft: `4px solid ${STATUS_COLOR[app.status]}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tr('kyb.reason')}</div>
          <div style={{ fontSize: 14 }}>{app.decision_reason}</div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{tr('kyb.company')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {FIELDS.map(([k]) => (
            <Field key={k} label={tr(`kyb.field.${k}`)}>
              <Input value={form[k] ?? ''} disabled={!editable} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
        {app.editable && <div style={{ marginTop: 12 }}><Button onClick={save} disabled={busy}>{tr('common.save')}</Button></div>}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{tr('kyb.documents')}</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>{tr('kyb.documents.hint')}</div>
        {DOCS.map((type) => {
          const doc = docOf(type)
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${t.border}` }}>
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontWeight: 600 }}>{tr(`kyb.doc.${type}`)}</div>
                <div style={{ fontSize: 12, color: doc ? '#16a34a' : t.textMuted }}>{doc ? `✓ ${doc.filename}` : tr('kyb.doc.missing')}</div>
              </div>
              {doc && <button onClick={() => view(doc.id)} style={{ background: 'none', border: 'none', color: t.primary, fontWeight: 600, cursor: 'pointer' }}>{tr('kyb.doc.view')}</button>}
              {app.editable && (
                <label style={{ color: t.primary, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                  {tr(doc ? 'kyb.doc.replace' : 'kyb.doc.add')}
                  <input type="file" accept="application/pdf,image/jpeg,image/png" hidden disabled={busy} onChange={(e) => upload(type, e.target.files?.[0])} />
                </label>
              )}
            </div>
          )
        })}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{tr('kyb.kyc')}</div>
        <div style={{ fontSize: 14, marginBottom: 10 }}>
          {app.kyc ? tr(`kyb.kyc.${app.kyc.status}`) : tr('kyb.kyc.none')}
        </div>
        {app.kyc?.status !== 'approuvé' && app.editable && <Button variant="ghost" onClick={startKyc} disabled={busy}>{tr(app.kyc ? 'kyb.kyc.resume' : 'kyb.kyc.start')}</Button>}
      </Card>

      {app.editable && (
        <Card style={{ marginBottom: 16 }}>
          {app.missing.length > 0 && (
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 10 }}>
              {tr('kyb.missing')} {app.missing.map((m) => (DOCS.includes(m) ? tr(`kyb.doc.${m}`) : tr(`kyb.field.${m}`))).join(', ')}
            </div>
          )}
          <Button onClick={submit} disabled={busy || app.missing.length > 0}>{tr('kyb.submit')}</Button>
        </Card>
      )}

      {message && <div style={{ color: message.error ? '#dc2626' : '#16a34a', fontSize: 14, marginBottom: 12 }}>{message.text}</div>}

      {app.history.length > 0 && (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{tr('kyb.history')}</div>
          {app.history.map((h, i) => (
            <div key={i} style={{ fontSize: 13, padding: '6px 0', borderTop: `1px solid ${t.border}` }}>
              <span style={{ color: t.textMuted }}>{new Date(h.at).toLocaleString('fr-FR')}</span> · {tr(`kyb.status.${h.to}`)}
              {h.reason ? ` — ${h.reason}` : ''}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
