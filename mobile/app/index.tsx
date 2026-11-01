// Accès à l'app marchand : connexion en deux étapes (mot de passe puis code),
// inscription et mot de passe oublié, sur les routes /v1/auth de l'API V1.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { ErrorLine, LineField, Pill, PrimaryButton, Spinner, useStatusBar, Wordmark } from '@/bank';
import { FadeIn } from '@/motion';
import { IllBudget, IllCollect, IllTransfer } from '@/illustrations';
import { Welcome } from '@/Welcome';
import { errorMessage, forgotPassword, login, register, resetPassword, type Challenge, type OtpChannel } from '@/api';
import { useSession } from '@/session';

type Flow = 'welcome' | 'login' | 'register' | 'code' | 'forgot' | 'reset';

const CHANNELS: { key: OtpChannel; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
];

export default function Access() {
  const { status, verify, logout, space } = useSession();
  useStatusBar('light');
  const [flow, setFlow] = useState<Flow>('welcome');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [accountType, setAccountType] = useState<'personal' | 'merchant'>('personal');
  const [reg, setReg] = useState({ name: '', phone: '', email: '' });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status === 'loading') return <Spinner />;
  if (status === 'authenticated' && space === 'personal') return <Redirect href="/(personal)" />;
  if (status === 'authenticated' && space === 'merchant') return <Redirect href="/(merchant)" />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const go = (next: Flow) => {
    setError(null);
    setNotice(null);
    setCode('');
    setFlow(next);
  };

  const submitLogin = () =>
    run(async () => {
      setChallenge(await login(identifier.trim(), password, channel));
      go('code');
    });

  const submitRegister = () =>
    run(async () => {
      setChallenge(await register({ name: reg.name.trim(), email: reg.email.trim(), phone: reg.phone.trim(), password, channel, account_type: accountType }));
      go('code');
    });

  const submitCode = () => run(async () => verify(challenge!.challenge, code.trim()));

  const submitForgot = () =>
    run(async () => {
      setChallenge(await forgotPassword(identifier.trim(), channel));
      go('reset');
    });

  const submitReset = () =>
    run(async () => {
      await resetPassword(challenge!.challenge, code.trim(), newPassword);
      setPassword('');
      go('login');
      setNotice('Mot de passe modifié. Connectez-vous.');
    });

  // Compte sans marchand actif (retiré d'une équipe, par exemple).
  if (status === 'authenticated') {
    return (
      <SafeAreaView style={s.root}>
        <View style={[s.body, { justifyContent: 'center', flex: 1 }]}>
          <Text style={s.h1}>Aucun commerce</Text>
          <Text style={s.lead}>Ce compte n'est membre d'aucun commerce actif. Demandez une invitation au propriétaire.</Text>
          <PrimaryButton label="Se déconnecter" variant="outline" onPress={logout} />
        </View>
      </SafeAreaView>
    );
  }

  if (flow === 'welcome') return <Welcome onSignUp={() => go('register')} onSignIn={() => go('login')} />;

  // Illustration du bandeau selon l'étape.
  const Ill = flow === 'register' ? IllBudget : flow === 'login' ? IllCollect : IllTransfer;
  const tagline = {
    login: 'Content de vous revoir.',
    register: 'Créez votre compte en une minute.',
    code: 'Une dernière vérification pour votre sécurité.',
    forgot: 'Pas d’inquiétude, on vous aide.',
    reset: 'Choisissez un nouveau mot de passe.',
  }[flow];

  const channelPicker = (
    <View style={{ gap: 6 }}>
      <Text style={s.small}>Recevoir le code par</Text>
      <View style={s.chips}>
        {CHANNELS.map((c) => (
          <Pill key={c.key} label={c.label} active={channel === c.key} onPress={() => setChannel(c.key)} />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={{ backgroundColor: B.navy }} keyboardShouldPersistTaps="handled">
          <View style={s.band}>
            <View style={s.glow} />
            <View style={s.glow2} />
            <View style={s.bandTop}>
              <Pressable onPress={() => go(flow === 'login' || flow === 'register' ? 'welcome' : flow === 'code' && reg.email ? 'register' : 'login')} hitSlop={10} style={s.bandBack} accessibilityRole="button" accessibilityLabel="Retour">
                <Icon name="chevron-left" size={24} color={B.white} />
              </Pressable>
              <Wordmark size={26} />
              <View style={{ width: 40 }} />
            </View>
            <FadeIn key={flow} style={s.bandIll}><Ill size={170} /></FadeIn>
            <Text style={s.bandText}>{tagline}</Text>
          </View>
          <View style={s.body}>

          {flow === 'login' && (
            <>
              <Text style={s.h1}>Connexion</Text>
              {notice ? <Text style={s.notice}>{notice}</Text> : null}
              <LineField label="Email ou téléphone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="username" placeholder="gerant@boutique.cg ou 06 123 45 67" />
              <LineField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
              {channelPicker}
              <ErrorLine message={error} />
              <PrimaryButton label="Continuer" busy={busy} disabled={!identifier || !password} onPress={submitLogin} />
              <Pressable onPress={() => go('forgot')}><Text style={s.link}>Mot de passe oublié ?</Text></Pressable>
              <View style={s.sep} />
              <Text style={s.small}>Pas encore de compte ?</Text>
              <PrimaryButton label="Créer un compte" variant="outline" onPress={() => go('register')} />
            </>
          )}

          {flow === 'register' && (
            <>
              <Text style={s.h1}>Créer un compte</Text>
              <View style={s.chips}>
                <Pill label="Particulier" active={accountType === 'personal'} onPress={() => setAccountType('personal')} />
                <Pill label="Commerçant" active={accountType === 'merchant'} onPress={() => setAccountType('merchant')} />
              </View>
              <Text style={s.lead}>
                {accountType === 'personal'
                  ? 'Gratuit. Votre budget, votre épargne et votre identifiant AlphaPay pour envoyer et recevoir.'
                  : 'Gratuit. Le mode test est disponible tout de suite ; le live après validation de votre dossier.'}
              </Text>
              <LineField label={accountType === 'personal' ? 'Nom et prénom' : 'Nom du commerce'} value={reg.name} onChangeText={(v) => setReg({ ...reg, name: v })} placeholder={accountType === 'personal' ? 'Zlatan Mabiala' : 'Boutique Mabiala'} />
              <LineField label="Téléphone" value={reg.phone} onChangeText={(v) => setReg({ ...reg, phone: v })} keyboardType="phone-pad" placeholder="06 123 45 67" />
              <LineField label="Email" value={reg.email} onChangeText={(v) => setReg({ ...reg, email: v })} autoCapitalize="none" keyboardType="email-address" />
              <LineField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry hint="10 caractères au moins." />
              {channelPicker}
              <ErrorLine message={error} />
              <PrimaryButton label="Créer le compte" busy={busy} disabled={!reg.name || !reg.phone || !reg.email || password.length < 10} onPress={submitRegister} />
            </>
          )}

          {flow === 'code' && challenge && (
            <>
              <Text style={s.h1}>Code de vérification</Text>
              <Text style={s.lead}>Saisissez le code à 6 chiffres envoyé{challenge.to ? ` à ${challenge.to}` : ''}.</Text>
              <LineField label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
              <ErrorLine message={error} />
              <PrimaryButton label="Valider" busy={busy} disabled={code.length !== 6} onPress={submitCode} />
            </>
          )}

          {flow === 'forgot' && (
            <>
              <Text style={s.h1}>Mot de passe oublié</Text>
              <Text style={s.lead}>Nous vous envoyons un code pour choisir un nouveau mot de passe.</Text>
              <LineField label="Email ou téléphone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
              {channelPicker}
              <ErrorLine message={error} />
              <PrimaryButton label="Envoyer le code" busy={busy} disabled={!identifier} onPress={submitForgot} />
            </>
          )}

          {flow === 'reset' && challenge && (
            <>
              <Text style={s.h1}>Nouveau mot de passe</Text>
              <Text style={s.lead}>Si le compte existe, un code a été envoyé. Toutes vos sessions seront fermées.</Text>
              <LineField label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
              <LineField label="Nouveau mot de passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry hint="10 caractères au moins." />
              <ErrorLine message={error} />
              <PrimaryButton label="Changer le mot de passe" busy={busy} disabled={code.length !== 6 || newPassword.length < 10} onPress={submitReset} />
            </>
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.navy },
  band: { backgroundColor: B.navy, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 44, overflow: 'hidden', alignItems: 'center' },
  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  bandBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  bandIll: { marginTop: 4 },
  glow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: B.navy3, opacity: 0.6, top: -120, right: -90 },
  glow2: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: B.burgundy, opacity: 0.45, bottom: -80, left: -50 },
  bandText: { fontFamily: F.medium, fontSize: 16, color: B.onNavyMuted, lineHeight: 23, textAlign: 'center' },
  body: { flex: 1, backgroundColor: B.bg, padding: 24, paddingBottom: 40, gap: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -28 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: F.regular, fontSize: 16, color: B.ink },
  h1: { fontFamily: F.bold, fontSize: 30, color: B.ink },
  lead: { fontFamily: F.regular, fontSize: 16, color: B.muted, lineHeight: 22 },
  small: { fontFamily: F.regular, fontSize: 14, color: B.muted },
  notice: { fontFamily: F.regular, fontSize: 15, color: B.success },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  link: { fontFamily: F.bold, color: B.navy3, fontSize: 16, textAlign: 'center' },
  sep: { height: 1, backgroundColor: B.line, marginVertical: 4 },
});
