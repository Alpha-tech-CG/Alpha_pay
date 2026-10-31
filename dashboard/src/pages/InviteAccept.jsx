import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/session'
import { useT } from '../i18n'
import { useTheme } from '../theme'
import { Card, Button } from '../ui'
import { useTeamApi } from '../team/useTeamApi'

// Page publique (pas de <Protected>) : le preview doit fonctionner déconnecté.
// L'acceptation, elle, exige d'être connecté avec le contact invité (vérifié).
export default function InviteAccept() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { status } = useAuth()
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
      .catch((err) => setPreviewError(err.response?.data?.error?.message || tr('invite.notFound')))
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
      setAcceptError(err.response?.data?.error?.message || tr('invite.acceptFailed'))
    } finally { setAccepting(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <Card style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{tr('invite.title')}</div>

        {!token && <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>⚠️ {tr('invite.noToken')}</div>}
        {previewError && <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>⚠️ {previewError}</div>}

        {preview && (
          <>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              <strong>{preview.merchantName}</strong> {tr('invite.invites')}{' '}
              <strong>{tr(`role.${preview.role}`)}</strong>.
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>
              {preview.email || preview.phone}
            </div>

            {preview.revoked && <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>{tr('invite.revoked')}</div>}
            {preview.accepted && <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 12 }}>{tr('invite.alreadyAccepted')}</div>}
            {preview.expired && !preview.revoked && !preview.accepted && (
              <div style={{ color: '#e11d48', fontSize: 13, marginBottom: 12 }}>{tr('invite.expired')}</div>
            )}

            {!preview.revoked && !preview.accepted && !preview.expired && (
              <>
                {status === 'anonymous' && (
                  <>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>{tr('invite.signin')}</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <a href={`/sign-in?next=${encodeURIComponent(redirectTarget)}`} style={{ textDecoration: 'none' }}>
                        <Button>{tr('auth.signin.submit')}</Button>
                      </a>
                      <a href={`/sign-up?next=${encodeURIComponent(redirectTarget)}`} style={{ textDecoration: 'none' }}>
                        <Button variant="ghost">{tr('auth.signup.submit')}</Button>
                      </a>
                    </div>
                  </>
                )}

                {status === 'authenticated' && (<>
                  {accepted ? (
                    <div style={{ color: t.primary, fontSize: 14, fontWeight: 700 }}>{tr('invite.accepted')}</div>
                  ) : (
                    <>
                      <Button onClick={accept} disabled={accepting} style={{ width: '100%' }}>
                        {accepting ? tr('invite.accepting') : tr('invite.accept')}
                      </Button>
                      {acceptError && <div style={{ marginTop: 10, color: '#e11d48', fontSize: 13 }}>⚠️ {acceptError}</div>}
                    </>
                  )}
                </>)}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
