import { useState } from 'react';
import { useStaff } from '../session';
import { errorText } from '../api';
import { Button, Card } from '../ui';

const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #2c3450', background: '#0f1320', color: '#e6e9f2', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 };

/** Connexion du personnel : mot de passe, puis code de l'application d'authentification (enrôlement au premier accès). */
export default function Login() {
  const { passwordStep, codeStep } = useStaff();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(null); // { kind: 'otp' | 'enroll', token, secret?, otpauth? }
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError(errorText(err, 'Connexion impossible')); } finally { setBusy(false); }
  };

  const submitPassword = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await passwordStep(email, password);
      setStep(r.step === 'enroll'
        ? { kind: 'enroll', token: r.enroll_token, secret: r.secret, otpauth: r.otpauth_url }
        : { kind: 'otp', token: r.otp_token });
      setPassword('');
    });
  };

  const submitCode = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        await codeStep(step.kind, step.token, code.replace(/\s/g, ''));
      } catch (err) {
        // Le jeton d'étape est à usage unique : après un code faux, on recommence.
        setStep(null);
        setCode('');
        throw err;
      }
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 4 }}>Alpha<span style={{ color: '#00B4D8' }}>Pay</span></div>
        <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 20, letterSpacing: 1 }}>BACK-OFFICE — PERSONNEL ALPHAPAY</div>

        {!step && (
          <form onSubmit={submitPassword}>
            <input style={input} type="email" autoComplete="username" placeholder="Email professionnel" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input style={input} type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button disabled={busy || !email || !password} style={{ width: '100%' }}>Continuer</Button>
          </form>
        )}

        {step?.kind === 'enroll' && (
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
            <b>Première connexion : sécurisez votre compte.</b>
            <ol style={{ paddingLeft: 18, margin: '8px 0' }}>
              <li>Ouvrez votre application d’authentification (Google Authenticator, Microsoft Authenticator…).</li>
              <li>Ajoutez un compte avec cette clé : <code style={{ display: 'block', wordBreak: 'break-all', background: '#0f1320', padding: 8, borderRadius: 6, margin: '6px 0', fontSize: 14 }}>{step.secret}</code>
                ou, sur téléphone, <a href={step.otpauth} style={{ color: '#00B4D8' }}>ouvrez ce lien</a>.</li>
              <li>Saisissez le code à 6 chiffres affiché.</li>
            </ol>
          </div>
        )}
        {step && (
          <form onSubmit={submitCode}>
            {step.kind === 'otp' && <div style={{ fontSize: 13, marginBottom: 10 }}>Code de votre application d’authentification :</div>}
            <input style={{ ...input, fontSize: 22, letterSpacing: 6, textAlign: 'center' }} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
            <Button disabled={busy || code.replace(/\s/g, '').length !== 6} style={{ width: '100%' }}>Se connecter</Button>
          </form>
        )}
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{error}</div>}
      </Card>
    </div>
  );
}
