// Accès à l'app marchand : connexion en deux étapes (mot de passe puis code),
// inscription et mot de passe oublié, sur les routes /v1/auth de l'API V1.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { ErrorLine, LineField, Pill, PrimaryButton, Spinner, useStatusBar, Wordmark } from '@/bank';
import * as Linking from 'expo-linking';
import { FadeIn, PressScale } from '@/motion';
import { IllBudget, IllCollect, IllTransfer } from '@/illustrations';
import { Welcome } from '@/Welcome';
import { DASHBOARD_URL, errorMessage, forgotPassword, login, register, resetPassword, type Challenge, type OtpChannel } from '@/api';
import { useSession } from '@/session';

type Flow = 'welcome' | 'login' | 'register' | 'code' | 'forgot' | 'reset';
type Goal = 'personal' | 'merchant' | 'developer';

// Ouverture de compte (D-066) : particulier par défaut ; marchand pour encaisser ;
// les développeurs ouvrent leur compte sur le site web.
const GOALS: { key: Goal; title: string; text: string; icon: string; bg: string; fg: string }[] = [
  { key: 'personal', title: 'Gérer mon argent', text: 'Budget, carte Visa, épargne, envoyer et recevoir.', icon: 'account-circle', bg: B.mustardSoft, fg: B.mustardDeep },
  { key: 'merchant', title: 'Encaisser mes clients', text: 'QR, liens de paiement, Mobile Money et carte.', icon: 'storefront', bg: B.navySoft, fg: B.navy },
  { key: 'developer', title: 'Intégrer l’API AlphaPay', text: 'Clés API, webhooks : compte ouvert sur le site.', icon: 'code', bg: B.burgundySoft, fg: B.burgundy },
];
const ACTIVITIES = [
  { key: 'shop', label: 'Boutique, commerce', icon: 'storefront', example: 'Boutique Mabiala' },
  { key: 'food', label: 'Restaurant, bar', icon: 'shopping-cart', example: 'Maquis Chez Tantine' },
  { key: 'school', label: 'École', icon: 'calendar', example: 'École Les Lauréats' },
  { key: 'services', label: 'Services', icon: 'settings', example: 'Pressing du Plateau' },
  { key: 'online', label: 'Vente en ligne', icon: 'shopping-bag', example: 'Mode Kintélé' },
  { key: 'other', label: 'Autre', icon: 'shapes', example: 'Mon activité' },
];

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
  const [goal, setGoal] = useState<Goal>('personal');
  const [regStep, setRegStep] = useState(0);
  const [activity, setActivity] = useState<string | null>(null);
  const [business, setBusiness] = useState('');
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
  if (status === 'authenticated' && space === 'developer') return <Redirect href="/(developer)" />;

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
    if (next === 'register') setRegStep(0);
    setError(null);
    setNotice(null);
    setCode('');
    setFlow(next);
  };

  const chooseGoal = (g: Goal) => {
    setGoal(g);
    setRegStep(g === 'personal' ? 2 : 1);
  };

  const submitLogin = () =>
    run(async () => {
      setChallenge(await login(identifier.trim(), password, channel));
      go('code');
    });

  const submitRegister = () =>
    run(async () => {
      setChallenge(await register({ name: reg.name.trim(), email: reg.email.trim(), phone: reg.phone.trim(), password, channel, account_type: goal === 'merchant' ? 'merchant' : 'personal', ...(goal === 'merchant' ? { business_name: business.trim() } : {}) }));
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
              <Pressable onPress={() => (flow === 'register' && regStep > 0 ? setRegStep(goal === 'personal' ? 0 : regStep - 1) : go(flow === 'login' || flow === 'register' ? 'welcome' : flow === 'code' && reg.email ? 'register' : 'login'))} hitSlop={10} style={s.bandBack} accessibilityRole="button" accessibilityLabel="Retour">
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

          {flow === 'register' && regStep === 0 && (
            <FadeIn key="q1" style={{ gap: 12 }}>
              <Text style={s.step}>Question 1 sur 2</Text>
              <Text style={s.h1}>Que voulez-vous faire avec AlphaPay ?</Text>
              {GOALS.map((g, i) => (
                <FadeIn key={g.key} index={i}>
                  <PressScale onPress={() => chooseGoal(g.key)} style={[s.option, goal === g.key && s.optionActive]} accessibilityRole="button" accessibilityLabel={g.title}>
                    <View style={[s.optionIcon, { backgroundColor: g.bg }]}><Icon name={g.icon} size={22} color={g.fg} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.optionTitle}>{g.title}</Text>
                      <Text style={s.optionText}>{g.text}</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={B.muted} />
                  </PressScale>
                </FadeIn>
              ))}
              <Text style={s.small}>Tous les comptes ont l’espace particulier : budget, carte Visa, épargne et identifiant AlphaPay.</Text>
            </FadeIn>
          )}

          {flow === 'register' && regStep === 1 && goal === 'developer' && (
            <FadeIn key="dev" style={{ gap: 14 }}>
              <Text style={s.h1}>Ouvrez votre compte développeur sur le site</Text>
              <Text style={s.lead}>Les comptes développeur (clés API, webhooks, journal) s’ouvrent sur le tableau de bord web. Avec les mêmes identifiants, vous vous connectez ensuite ici : espace particulier, espace marchand et espace développeur.</Text>
              <PrimaryButton label="Ouvrir le site AlphaPay" icon="open-in-new" onPress={() => Linking.openURL(`${DASHBOARD_URL}/sign-up`)} />
              <PrimaryButton label="J’ai déjà mes identifiants" variant="outline" onPress={() => go('login')} />
            </FadeIn>
          )}

          {flow === 'register' && regStep === 1 && goal === 'merchant' && (
            <FadeIn key="q2" style={{ gap: 12 }}>
              <Text style={s.step}>Question 2 sur 2</Text>
              <Text style={s.h1}>Quelle est votre activité ?</Text>
              <View style={s.grid}>
                {ACTIVITIES.map((a, i) => (
                  <FadeIn key={a.key} index={i} style={{ width: '48%' }}>
                    <PressScale onPress={() => { setActivity(a.key); setRegStep(2); }} style={[s.tile, activity === a.key && s.optionActive]} accessibilityRole="button" accessibilityLabel={a.label}>
                      <Icon name={a.icon} size={24} color={B.navy} />
                      <Text style={s.tileText}>{a.label}</Text>
                    </PressScale>
                  </FadeIn>
                ))}
              </View>
            </FadeIn>
          )}

          {flow === 'register' && regStep === 2 && (
            <FadeIn key="form" style={{ gap: 18 }}>
              <Text style={s.step}>Dernière étape</Text>
              <Text style={s.h1}>{goal === 'merchant' ? 'Votre commerce et vous' : 'Vos informations'}</Text>
              <Text style={s.lead}>
                {goal === 'merchant'
                  ? 'Gratuit. Mode test tout de suite, live après validation de votre dossier. Votre espace particulier est inclus.'
                  : 'Gratuit. Budget, carte Visa, épargne et identifiant AlphaPay pour envoyer et recevoir.'}
              </Text>
              <LineField label="Nom et prénom" value={reg.name} onChangeText={(v) => setReg({ ...reg, name: v })} placeholder="Zlatan Mabiala" autoComplete="name" />
              {goal === 'merchant' && (
                <LineField label="Nom du commerce" value={business} onChangeText={setBusiness} placeholder={ACTIVITIES.find((a) => a.key === activity)?.example ?? 'Boutique Mabiala'} />
              )}
              <LineField label="Téléphone" value={reg.phone} onChangeText={(v) => setReg({ ...reg, phone: v })} keyboardType="phone-pad" placeholder="06 123 45 67" autoComplete="tel" />
              <LineField label="Email" value={reg.email} onChangeText={(v) => setReg({ ...reg, email: v })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
              <LineField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry hint="10 caractères au moins." />
              {channelPicker}
              <ErrorLine message={error} />
              <PrimaryButton label="Créer mon compte" icon="check" busy={busy} disabled={!reg.name || !reg.phone || !reg.email || password.length < 10 || (goal === 'merchant' && business.trim().length < 2)} onPress={submitRegister} />
            </FadeIn>
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
  step: { fontFamily: F.semibold, fontSize: 12, color: B.mustardDeep, letterSpacing: 0.8, textTransform: 'uppercase' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: B.surface, borderRadius: R.lg, padding: 14, borderWidth: 1.5, borderColor: B.line },
  optionActive: { borderColor: B.navy },
  optionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontFamily: F.semibold, fontSize: 16, color: B.ink },
  optionText: { fontFamily: F.regular, fontSize: 13, color: B.muted, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  tile: { backgroundColor: B.surface, borderRadius: R.lg, padding: 16, gap: 10, borderWidth: 1.5, borderColor: B.line, minHeight: 96 },
  tileText: { fontFamily: F.semibold, fontSize: 14, color: B.ink },
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
