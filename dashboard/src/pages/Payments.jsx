import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import { useTheme } from '../theme'
import { Card, Button, Field, Input, Select } from '../ui'

function CopyRow({ label, value, mono }) {
  const { t } = useTheme()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          flex: 1, minWidth: 0, background: t.surfaceAlt, borderRadius: 8, padding: '9px 12px',
          fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit', color: t.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value}</div>
        <button onClick={copy} style={{
          border: `1px solid ${t.border}`, background: t.surface, borderRadius: 8,
          padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
          color: copied ? t.primary : t.textMuted, whiteSpace: 'nowrap',
        }}>{copied ? 'Copié ✓' : 'Copier'}</button>
      </div>
    </div>
  )
}

export default function Payments() {
  const { t } = useTheme()
  const [form, setForm] = useState({ amount: '', currency: 'XAF', description: '', expiresInMinutes: '' })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }))

  const generate = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await api.post('/paylinks', {
        amount: Number(form.amount), currency: form.currency, description: form.description,
        expiresInMinutes: form.expiresInMinutes ? Number(form.expiresInMinutes) : undefined,
      })
      setResult({ ...r.data, amount: Number(form.amount), currency: form.currency, description: form.description })
    } catch (err) {
      setError(err.response?.data?.message || 'Échec de la génération')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Paiements</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>

        {/* Configuration */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Détails du paiement</div>
          <form onSubmit={generate}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 2 }}><Field label="Montant"><Input type="number" min="1" value={form.amount} onChange={update('amount')} placeholder="2500" required /></Field></div>
              <div style={{ flex: 1 }}><Field label="Devise"><Select value={form.currency} onChange={update('currency')}><option>XAF</option><option>EUR</option><option>USD</option></Select></Field></div>
            </div>
            <Field label="Description"><Input value={form.description} onChange={update('description')} placeholder="T-shirt Alpha-Educ" required /></Field>
            <Field label="Expiration (minutes, optionnel)"><Input type="number" min="1" value={form.expiresInMinutes} onChange={update('expiresInMinutes')} placeholder="60" /></Field>
            <Button type="submit" disabled={busy} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
              {busy ? 'Génération…' : 'Générer les supports de paiement'}
            </Button>
          </form>
          {error && <div style={{ marginTop: 14, color: '#e11d48', fontSize: 13 }}>⚠️ {error}</div>}
        </Card>

        {/* Aperçu temps réel : 3 canaux */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Aperçu</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: t.primary, background: `${t.primary}1f`, borderRadius: 9999, padding: '3px 10px' }}>3 canaux</span>
          </div>

          {!result ? (
            <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 14, padding: '40px 0' }}>
              Renseigne un montant puis génère les supports.
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ display: 'inline-block', background: '#fff', borderRadius: 12, padding: 12, border: `1px solid ${t.border}` }}>
                  <QRCodeSVG value={result.url} size={148} fgColor="#0F6E56" />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: t.text, marginTop: 12 }}>
                  {Number(result.amount).toLocaleString('fr-FR')} <span style={{ fontSize: 14, color: t.textMuted }}>{result.currency}</span>
                </div>
                <div style={{ fontSize: 13, color: t.textMuted }}>{result.description}</div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: t.textMuted, textTransform: 'uppercase', margin: '4px 0 10px' }}>Canaux client</div>
              <CopyRow label="📱 Scan QR / Lien de paiement (sans compte)" value={result.url} />
              <CopyRow label="📞 Code USSD (téléphone à touches, tout opérateur)" value={result.ussd} mono />
              <CopyRow label="# Code à composer seul" value={result.code} mono />

              {result.expiresAt && (
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                  Expire le {new Date(result.expiresAt).toLocaleString('fr-FR')}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
