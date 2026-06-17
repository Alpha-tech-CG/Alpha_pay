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
    <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
            background: i <= current ? t.primary : t.surfaceAlt,
            color: i <= current ? t.primaryText : t.textMuted,
          }}>{i + 1}</div>
          <span style={{ fontSize: 13, color: i === current ? t.text : t.textMuted, fontWeight: i === current ? 700 : 500 }}>{label}</span>
          {i < steps.length - 1 && <span style={{ color: t.border }}>—</span>}
        </div>
      ))}
    </div>
  )
}

export default function Onboarding() {
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
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 20 }}>{tr('onboarding.title')}</h1>
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
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <p style={{ fontSize: 32 }}>🎉</p>
              <p>{tr('onboarding.welcome.text')}</p>
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
