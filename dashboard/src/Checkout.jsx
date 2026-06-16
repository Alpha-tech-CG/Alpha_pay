import { useEffect, useState } from 'react'
import axios from 'axios'

const API = '/api'

const inputStyle = {
  background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8,
  padding: '10px 12px', color: '#e2e8f0', fontSize: 13, width: '100%',
  boxSizing: 'border-box',
}
const labelStyle = { fontSize: 12, color: '#94a3b8', marginBottom: 6, display: 'block' }

export default function Checkout({ linkId }) {
  const [link, setLink]       = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [phone, setPhone]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(null)

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
    <div style={{ maxWidth: 420, margin: '60px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 24, textAlign: 'center' }}>
        Pay<span style={{ color: '#3b82f6' }}>Brain</span>
      </h1>

      <div style={{
        background: '#1e2433', border: '1px solid #2d3748', borderRadius: 12,
        padding: '24px',
      }}>
        {loadError && (
          <div style={{ color: '#ef4444', fontSize: 14, textAlign: 'center' }}>⚠️ {loadError}</div>
        )}

        {!loadError && !link && (
          <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>Chargement...</div>
        )}

        {link && !success && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0' }}>
                {Number(link.amount).toLocaleString('fr-FR')} <span style={{ fontSize: 14, color: '#64748b' }}>{link.currency}</span>
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{link.description}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{link.merchant?.name}</div>
            </div>

            {link.usedAt ? (
              <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>
                Ce lien de paiement a déjà été utilisé.
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <label style={labelStyle}>Numéro de téléphone</label>
                <input style={{ ...inputStyle, marginBottom: 16 }} value={phone}
                  onChange={e => setPhone(e.target.value)} placeholder="242066123456" required />
                <button type="submit" disabled={submitting} style={{
                  width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
                  cursor: submitting ? 'default' : 'pointer', fontSize: 14, fontWeight: 700,
                  background: submitting ? '#1e293b' : '#3b82f6', color: '#fff',
                }}>
                  {submitting ? 'Envoi en cours...' : 'Payer'}
                </button>
              </form>
            )}

            {error && (
              <div style={{ marginTop: 16, color: '#ef4444', fontSize: 13, textAlign: 'center' }}>⚠️ {error}</div>
            )}
          </>
        )}

        {success && (
          <div style={{ textAlign: 'center', color: '#22c55e', fontSize: 14 }}>
            ✅ Paiement initié — statut {success.status}<br />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Confirmez sur votre téléphone.</span>
          </div>
        )}
      </div>
    </div>
  )
}
