import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Button, Card, Field, Input, Select } from '../ui'
import { errorMessage, useAuth } from './session'

function AuthShell({ title, children }) {
  const { t } = useTheme()
  const { t: tr } = useT()
  return (
    <div style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 16, gap: 22,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 9, background: t.primary, color: t.primaryText,
            display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800,
          }}>A</span>
          <span style={{ fontSize: 26, fontWeight: 800 }}>AlphaPay</span>
        </div>
        <div style={{ color: t.textMuted, fontSize: 13 }}>{tr('auth.tagline')}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 14 }}>{title}</div>
      </div>
      <Card style={{ width: '100%', maxWidth: 400 }}>{children}</Card>
    </div>
  )
}

function ErrorText({ children }) {
  if (!children) return null
  return <div role="alert" style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{children}</div>
}

function ChannelSelect({ value, onChange }) {
  const { t: tr } = useT()
  return (
    <Field label={tr('auth.channel')}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="sms">{tr('auth.channel.sms')}</option>
        <option value="whatsapp">{tr('auth.channel.whatsapp')}</option>
        <option value="email">{tr('auth.channel.email')}</option>
      </Select>
    </Field>
  )
}

/** Étape « code reçu » commune à l'inscription et à la connexion. */
function CodeStep({ challenge, onDone, onBack }) {
  const { t: tr } = useT()
  const { verify } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verify(challenge.challenge, code)
      onDone()
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        {tr('auth.code.sent')} {challenge.to ? <strong>{challenge.to}</strong> : null}
      </p>
      <Field label={tr('auth.code')}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          autoFocus
          required
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, letterSpacing: 6, textAlign: 'center' }}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy || code.length !== 6} style={{ width: '100%' }}>{tr('auth.code.submit')}</Button>
      <Button variant="ghost" onClick={onBack} style={{ width: '100%', marginTop: 10 }}>{tr('common.back')}</Button>
    </form>
  )
}

export function SignInPage() {
  const { t: tr } = useT()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ identifier: '', password: '', channel: 'sms' })
  const [challenge, setChallenge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const next = params.get('next') || '/'

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setChallenge(await login(form))
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={tr('auth.signin.title')}>
      {challenge ? (
        <CodeStep challenge={challenge} onDone={() => navigate(next, { replace: true })} onBack={() => setChallenge(null)} />
      ) : (
        <form onSubmit={submit}>
          <Field label={tr('auth.identifier')}>
            <Input value={form.identifier} onChange={set('identifier')} autoComplete="username" required />
          </Field>
          <Field label={tr('auth.password')}>
            <Input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required />
          </Field>
          <ChannelSelect value={form.channel} onChange={(channel) => setForm({ ...form, channel })} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>{tr('auth.signin.submit')}</Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13, flexWrap: 'wrap', gap: 8 }}>
            <Link to="/forgot-password">{tr('auth.forgot.link')}</Link>
            <Link to={`/sign-up${params.toString() ? `?${params}` : ''}`}>{tr('auth.toSignup')}</Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}

export function SignUpPage() {
  const { t: tr } = useT()
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', channel: 'sms' })
  const [challenge, setChallenge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setChallenge(await register(form))
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={tr('auth.signup.title')}>
      {challenge ? (
        <CodeStep challenge={challenge} onDone={() => navigate(params.get('next') || '/', { replace: true })} onBack={() => setChallenge(null)} />
      ) : (
        <form onSubmit={submit}>
          <Field label={tr('auth.name')}>
            <Input value={form.name} onChange={set('name')} autoComplete="organization" required />
          </Field>
          <Field label={tr('auth.phone')}>
            <Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="06 123 45 67" required />
          </Field>
          <Field label={tr('auth.email')}>
            <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </Field>
          <Field label={tr('auth.password')}>
            <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={10} required />
          </Field>
          <div style={{ fontSize: 12, marginTop: -8, marginBottom: 14, opacity: 0.75 }}>{tr('auth.password.rules')}</div>
          <ChannelSelect value={form.channel} onChange={(channel) => setForm({ ...form, channel })} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>{tr('auth.signup.submit')}</Button>
          <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
            <Link to={`/sign-in${params.toString() ? `?${params}` : ''}`}>{tr('auth.toSignin')}</Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const { t: tr } = useT()
  const { forgot, reset } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ identifier: '', channel: 'sms', code: '', password: '' })
  const [challenge, setChallenge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const ask = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setChallenge(await forgot({ identifier: form.identifier, channel: form.channel }))
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  const change = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await reset({ challenge: challenge.challenge, code: form.code, password: form.password })
      setDone(true)
    } catch (err) {
      setError(errorMessage(err, tr('auth.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={tr('auth.forgot.title')}>
      {done ? (
        <div>
          <p style={{ fontSize: 14 }}>{tr('auth.forgot.done')}</p>
          <Button onClick={() => navigate('/sign-in')} style={{ width: '100%' }}>{tr('auth.signin.submit')}</Button>
        </div>
      ) : challenge ? (
        <form onSubmit={change}>
          <p style={{ fontSize: 13, marginTop: 0 }}>{tr('auth.forgot.sent')}</p>
          <Field label={tr('auth.code')}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" autoComplete="one-time-code" required />
          </Field>
          <Field label={tr('auth.password.new')}>
            <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={10} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>{tr('auth.forgot.submit')}</Button>
        </form>
      ) : (
        <form onSubmit={ask}>
          <Field label={tr('auth.identifier')}>
            <Input value={form.identifier} onChange={set('identifier')} autoComplete="username" required />
          </Field>
          <ChannelSelect value={form.channel} onChange={(channel) => setForm({ ...form, channel })} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>{tr('auth.forgot.ask')}</Button>
          <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
            <Link to="/sign-in">{tr('common.back')}</Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
