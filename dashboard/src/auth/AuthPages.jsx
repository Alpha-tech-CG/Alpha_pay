import { SignIn, SignUp } from '@clerk/clerk-react'
import { useTheme } from '../theme'
import { useT } from '../i18n'

// Thème Clerk aligné sur l'identité « Lumina » émeraude (boutons, focus, liens).
const clerkAppearance = {
  variables: {
    colorPrimary: '#059669',
    colorText: '#151c27',
    borderRadius: '0.6rem',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    card: { boxShadow: '0 4px 16px rgba(16,24,40,0.05)', border: '1px solid #e6ece9' },
    headerTitle: { fontWeight: 700 },
    formButtonPrimary: { fontWeight: 700, textTransform: 'none' },
  },
}

function AuthShell({ title, children }) {
  const { t } = useTheme()
  return (
    <div style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, gap: 22,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 9, background: t.primary, color: '#fff',
            display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800,
          }}>P</span>
          <span style={{ fontSize: 26, fontWeight: 800 }}>PayBrain</span>
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: 2 }}>GROUPE ALPHA</div>
        <div style={{ color: t.textMuted, fontSize: 14, marginTop: 6 }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

export function SignInPage() {
  const { t: tr } = useT()
  return (
    <AuthShell title={tr('auth.signin.title')}>
      {/* fallbackRedirectUrl (pas forceRedirectUrl) : respecte ?redirect_url=
          quand présent (ex. lien d'invitation équipe), sinon /onboarding. */}
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/onboarding" appearance={clerkAppearance} />
    </AuthShell>
  )
}

export function SignUpPage() {
  const { t: tr } = useT()
  return (
    <AuthShell title={tr('auth.signup.title')}>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/onboarding" appearance={clerkAppearance} />
    </AuthShell>
  )
}
