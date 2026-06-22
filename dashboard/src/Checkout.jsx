import { useEffect, useState } from 'react'
import axios from 'axios'

const API = '/api'

// Identité « Lumina » : émeraude sur fond clair, Inter, cartes arrondies.
const C = {
  bg: '#f7f9f8', surface: '#ffffff', border: '#e6ece9',
  text: '#151c27', muted: '#5c6b63', primary: '#059669', primaryDark: '#047857',
  successBg: '#ecfdf5', success: '#047857', error: '#e11d48',
}

const inputStyle = {
  background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '13px 14px', color: C.text, fontSize: 15, width: '100%',
  boxSizing: 'border-box', outline: 'none', height: 48,
}
const labelStyle = { fontSize: 12, color: C.muted, marginBottom: 6, display: 'block', fontWeight: 600 }

export default function Checkout({ linkId }) {
  const [link, setLink] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [focus, setFocus] = useState(false)

  useEffect(() => {
    axios.get(`${API}/paylinks/${linkId}`)
      .then(r => setLink(r.data))
      .catch(err => setLoadError(err.response?.data?.message || 'Lien introuvable'))
  }, [linkId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const r = await axios.post(`${API}/paylinks/${linkId}/pay`, { phone })
      setSuccess(r.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Échec du paiement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif", padding: '0 16px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', paddingTop: 56 }}>
        {/* Marque */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 28 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 8, background: C.primary, color: '#fff',
            display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800,
          }}>P</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>PayBrain</span>
        </div>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
          padding: 24, boxShadow: '0 4px 16px rgba(16,24,40,0.04)',
        }}>
          {loadError && (
            <div style={{ color: C.error, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>⚠️ {loadError}</div>
          )}

          {!loadError && !link && (
            <div style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Chargement…</div>
          )}

          {link && !success && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Montant à payer</div>
                <div style={{ fontSize: 38, fontWeight: 800, color: C.text, marginTop: 6, letterSpacing: '-0.02em' }}>
                  {Number(link.amount).toLocaleString('fr-FR')} <span style={{ fontSize: 18, color: C.muted, fontWeight: 600 }}>{link.currency}</span>
                </div>
                {link.description && <div style={{ fontSize: 14, color: C.text, marginTop: 8 }}>{link.description}</div>}
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{link.merchant?.name}</div>
              </div>

              {link.usedAt ? (
                <div style={{ color: C.error, fontSize: 14, textAlign: 'center' }}>Ce lien de paiement a déjà été utilisé.</div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <label style={labelStyle}>Numéro Mobile Money</label>
                  <input style={{ ...inputStyle, marginBottom: 18, borderColor: focus ? C.primary : C.border, boxShadow: focus ? `0 0 0 3px ${C.successBg}` : 'none' }}
                    value={phone} onChange={e => setPhone(e.target.value)}
                    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                    placeholder="+242 06 612 34 56" required inputMode="tel" />
                  <button type="submit" disabled={submitting} style={{
                    width: '100%', padding: '14px 20px', borderRadius: 10, border: 'none',
                    cursor: submitting ? 'default' : 'pointer', fontSize: 15, fontWeight: 700,
                    background: submitting ? '#9ad9c0' : C.primary, color: '#fff', height: 50,
                    transition: 'background 0.15s',
                  }}>
                    {submitting ? 'Envoi en cours…' : `Payer ${Number(link.amount).toLocaleString('fr-FR')} ${link.currency}`}
                  </button>
                </form>
              )}

              {error && <div style={{ marginTop: 16, color: C.error, fontSize: 13, textAlign: 'center' }}>⚠️ {error}</div>}
            </>
          )}

          {success && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: C.successBg, color: C.success,
                display: 'grid', placeItems: 'center', fontSize: 28, margin: '0 auto 14px',
              }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Paiement initié</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                Statut : {success.status}.<br />Confirmez sur votre téléphone avec votre code PIN.
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: C.muted }}>
          🔒 Paiement sécurisé · chiffré de bout en bout
        </div>
      </div>
    </div>
  )
}
