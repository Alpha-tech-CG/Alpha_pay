import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { useTheme } from '../theme'
import { Card, Button } from '../ui'
import { useTeamApi } from '../team/useTeamApi'

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', MANAGER: 'Manager', MEMBER: 'Membre', VIEWER: 'Lecteur' }

// Page publique (pas de <Protected>) : le preview doit fonctionner déconnecté.
// L'acceptation, elle, exige une session Clerk (voir SignedIn ci-dessous).
export default function InviteAccept() {
  const { t } = useTheme()
  const navigate = useNavigate()
  const teamApi = useTeamApi()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!token) return
    teamApi.previewInvitation(token)
      .then(setPreview)
      .catch((err) => setPreviewError(err.response?.data?.message || 'Invitation introuvable ou expirée.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const redirectTarget = `/invite?token=${encodeURIComponent(token)}`

  const accept = async () => {
    setAccepting(true); setAcceptError(null)
    try {
      await teamApi.acceptInvitation(token)
      setAccepted(true)
      setTimeout(() => navigate('/team'), 1200)
    } catch (err) {
      setAcceptError(err.response?.data?.message || 'Échec de l’acceptation de l’invitation.')
    } finally { setAccepting(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <Card style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Invitation d’équipe</div>

        {!token && <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>⚠️ Lien d’invitation invalide (token manquant).</div>}
        {previewError && <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>⚠️ {previewError}</div>}

        {preview && (
          <>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              <strong>{preview.merchantName}</strong> vous invite avec le rôle{' '}
              <strong>{ROLE_LABEL[preview.role] || preview.role}</strong>.
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>
              Adresse invitée : {preview.email}
            </div>

            {preview.revoked && <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>Cette invitation a été révoquée.</div>}
            {preview.accepted && <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 12 }}>Cette invitation a déjà été acceptée.</div>}
            {preview.expired && !preview.revoked && !preview.accepted && (
              <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>Cette invitation a expiré.</div>
            )}

            {!preview.revoked && !preview.accepted && !preview.expired && (
              <>
                <SignedOut>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a href={`/sign-in?redirect_url=${encodeURIComponent(redirectTarget)}`} style={{ textDecoration: 'none' }}>
                      <Button>Se connecter</Button>
                    </a>
                    <a href={`/sign-up?redirect_url=${encodeURIComponent(redirectTarget)}`} style={{ textDecoration: 'none' }}>
                      <Button variant="ghost">Créer un compte</Button>
                    </a>
                  </div>
                </SignedOut>

                <SignedIn>
                  {accepted ? (
                    <div style={{ color: t.primary, fontSize: 14, fontWeight: 700 }}>Invitation acceptée ✓ Redirection…</div>
                  ) : (
                    <>
                      <Button onClick={accept} disabled={accepting} style={{ width: '100%' }}>
                        {accepting ? 'Acceptation…' : 'Accepter l’invitation'}
                      </Button>
                      {acceptError && <div style={{ marginTop: 10, color: '#e11d48', fontSize: 13 }}>⚠️ {acceptError}</div>}
                    </>
                  )}
                </SignedIn>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
