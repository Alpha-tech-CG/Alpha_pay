import { SignIn, SignUp } from '@clerk/clerk-react'
import { useTheme } from '../theme'
import { useT } from '../i18n'

function AuthShell({ title, children }) {
  const { t } = useTheme()
  return (
    <div style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, gap: 20,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: 2 }}>GROUPE ALPHA</div>
        <div style={{ fontSize: 30, fontWeight: 900 }}>
          Pay<span style={{ color: t.primary }}>Brain</span>
        </div>
        <div style={{ color: t.textMuted, fontSize: 14, marginTop: 4 }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

export function SignInPage() {
  const { t: tr } = useT()
  return (
    <AuthShell title={tr('auth.signin.title')}>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/onboarding" />
    </AuthShell>
  )
}

export function SignUpPage() {
  const { t: tr } = useT()
  return (
    <AuthShell title={tr('auth.signup.title')}>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/onboarding" />
    </AuthShell>
  )
}
