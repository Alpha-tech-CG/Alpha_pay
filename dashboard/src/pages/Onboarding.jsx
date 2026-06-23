import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Card, Button, Field, Input } from '../ui'

const PROFILE_KEY = 'pb_merchant_profile'

function Stepper({ steps, current }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 26 }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : '0 0 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 64 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 13, fontWeight: 700,
                background: done || active ? t.primary : t.surfaceAlt,
                color: done || active ? t.primaryText : t.textMuted,
              }}>{done ? '✓' : i + 1}</div>
              <span style={{ fontSize: 11, textAlign: 'center', color: active ? t.text : t.textMuted, fontWeight: active ? 700 : 500 }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < current ? t.primary : t.border, margin: '0 -2px', marginBottom: 18 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Onboarding() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user } = useUser()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {} } catch { return {} }
  })

  const steps = [
    tr('onboarding.step.company'),
    tr('onboarding.step.contact'),
    tr('onboarding.step.verify'),
    tr('onboarding.step.welcome'),
  ]
  const update = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }))
  const emailVerified = user?.primaryEmailAddress?.verification?.status === 'verified'

  const persistAndFinish = () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data))
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: t.primary, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 800 }}>P</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>PayBrain</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>{tr('onboarding.title')}</h1>
        <Card>
          <Stepper steps={steps} current={step} />

          {step === 0 && (
            <>
              <Field label={tr('onboarding.company.legalName')}>
                <Input value={data.legalName || ''} onChange={update('legalName')} placeholder="Groupe Alpha SARL" />
              </Field>
              <Field label={tr('onboarding.company.tradeName')}>
                <Input value={data.tradeName || ''} onChange={update('tradeName')} placeholder="PayBrain" />
              </Field>
              <Field label={tr('onboarding.company.country')}>
                <Input value={data.country || ''} onChange={update('country')} placeholder="Congo" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label={tr('onboarding.contact.fullName')}>
                <Input value={data.contactName || ''} onChange={update('contactName')} placeholder="Jean Mavoungou" />
              </Field>
              <Field label={tr('onboarding.contact.phone')}>
                <Input value={data.contactPhone || ''} onChange={update('contactPhone')} placeholder="+242066123456" />
              </Field>
              <Field label={tr('onboarding.contact.address')}>
                <Input value={data.address || ''} onChange={update('address')} placeholder="Brazzaville, Congo" />
              </Field>
            </>
          )}

          {step === 2 && (
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <p>{tr('onboarding.verify.text')}</p>
              <p style={{ fontWeight: 700, color: emailVerified ? '#16a34a' : '#d97706' }}>
                {emailVerified ? tr('onboarding.verify.verified') : tr('onboarding.verify.pending')}
              </p>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: `${t.primary}1f`, color: t.primary,
                display: 'grid', placeItems: 'center', fontSize: 30, margin: '0 auto 14px',
              }}>✓</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: t.textMuted }}>{tr('onboarding.welcome.text')}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              {tr('common.back')}
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>{tr('common.next')}</Button>
            ) : (
              <Button onClick={persistAndFinish}>{tr('onboarding.welcome.cta')}</Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
