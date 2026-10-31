// Accès à l'app marchand : connexion en deux étapes (mot de passe puis code),
// inscription et mot de passe oublié, sur les routes /v1/auth de l'API V1.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP } from '@/design';
import { ucFont } from '@/uc';
import { Button, Chip, ErrorBox, Field, Loading } from '@/kit';
import { errorMessage, forgotPassword, login, register, resetPassword, type Challenge, type OtpChannel } from '@/api';
import { useSession } from '@/session';

type Flow = 'login' | 'register' | 'code' | 'forgot' | 'reset';

const CHANNELS: { key: OtpChannel; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
];

export default function Access() {
  const { status, user, verify, logout } = useSession();
  const [flow, setFlow] = useState<Flow>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [reg, setReg] = useState({ name: '', phone: '', email: '' });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status === 'loading') return <Loading />;
  if (status === 'authenticated' && user?.merchants?.length) return <Redirect href="/(merchant)" />;

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
      setChallenge(await register({ name: reg.name.trim(), email: reg.email.trim(), phone: reg.phone.trim(), password, channel }));
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
          <Button label="Se déconnecter" variant="ghost" onPress={logout} />
        </View>
      </SafeAreaView>
    );
  }

  const channelPicker = (
    <View style={{ gap: 6 }}>
      <Text style={s.small}>Recevoir le code par</Text>
      <View style={s.chips}>
        {CHANNELS.map((c) => (
          <Chip key={c.key} label={c.label} active={channel === c.key} onPress={() => setChannel(c.key)} />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.brand}>
            <View style={s.logo}><Text style={s.logoText}>A</Text></View>
            <Text style={s.brandText}>AlphaPay</Text>
          </View>

          {flow !== 'login' && (
            <Pressable onPress={() => go(flow === 'code' && challenge && reg.email ? 'register' : 'login')} style={s.back}>
              <Icon name="arrow-back" size={20} color={AP.secondary} />
              <Text style={s.backText}>Retour</Text>
            </Pressable>
          )}

          {flow === 'login' && (
            <>
              <Text style={s.h1}>Connexion</Text>
              <Text style={s.lead}>Encaissez et suivez vos paiements Mobile Money et carte.</Text>
              {notice ? <Text style={s.notice}>{notice}</Text> : null}
              <Field label="Email ou téléphone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="username" placeholder="gerant@boutique.cg ou 06 123 45 67" />
              <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
              {channelPicker}
              <ErrorBox message={error} />
              <Button label="Continuer" busy={busy} disabled={!identifier || !password} onPress={submitLogin} />
              <Pressable onPress={() => go('forgot')}><Text style={s.link}>Mot de passe oublié ?</Text></Pressable>
              <View style={s.sep} />
              <Text style={s.small}>Pas encore de compte ?</Text>
              <Button label="Créer un compte marchand" variant="ghost" onPress={() => go('register')} />
            </>
          )}

          {flow === 'register' && (
            <>
              <Text style={s.h1}>Créer un compte</Text>
              <Text style={s.lead}>Gratuit. Le mode test est disponible tout de suite ; le live après validation de votre dossier.</Text>
              <Field label="Nom du commerce" value={reg.name} onChangeText={(v) => setReg({ ...reg, name: v })} placeholder="Boutique Mabiala" />
              <Field label="Téléphone" value={reg.phone} onChangeText={(v) => setReg({ ...reg, phone: v })} keyboardType="phone-pad" placeholder="06 123 45 67" />
              <Field label="Email" value={reg.email} onChangeText={(v) => setReg({ ...reg, email: v })} autoCapitalize="none" keyboardType="email-address" />
              <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry hint="10 caractères au moins." />
              {channelPicker}
              <ErrorBox message={error} />
              <Button label="Créer le compte" busy={busy} disabled={!reg.name || !reg.phone || !reg.email || password.length < 10} onPress={submitRegister} />
            </>
          )}

          {flow === 'code' && challenge && (
            <>
              <Text style={s.h1}>Code de vérification</Text>
              <Text style={s.lead}>Saisissez le code à 6 chiffres envoyé{challenge.to ? ` à ${challenge.to}` : ''}.</Text>
              <Field label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
              <ErrorBox message={error} />
              <Button label="Valider" busy={busy} disabled={code.length !== 6} onPress={submitCode} />
            </>
          )}

          {flow === 'forgot' && (
            <>
              <Text style={s.h1}>Mot de passe oublié</Text>
              <Text style={s.lead}>Nous vous envoyons un code pour choisir un nouveau mot de passe.</Text>
              <Field label="Email ou téléphone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
              {channelPicker}
              <ErrorBox message={error} />
              <Button label="Envoyer le code" busy={busy} disabled={!identifier} onPress={submitForgot} />
            </>
          )}

          {flow === 'reset' && challenge && (
            <>
              <Text style={s.h1}>Nouveau mot de passe</Text>
              <Text style={s.lead}>Si le compte existe, un code a été envoyé. Toutes vos sessions seront fermées.</Text>
              <Field label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
              <Field label="Nouveau mot de passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry hint="10 caractères au moins." />
              <ErrorBox message={error} />
              <Button label="Changer le mot de passe" busy={busy} disabled={code.length !== 6 || newPassword.length < 10} onPress={submitReset} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  body: { padding: 24, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 12 },
  logo: { width: 40, height: 40, borderRadius: 8, backgroundColor: AP.destructive, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 22, fontFamily: ucFont.condensed, fontWeight: '700' },
  brandText: { fontSize: 22, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 15, color: AP.secondary },
  h1: { fontSize: 28, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  lead: { fontSize: 15, color: AP.mutedForeground, lineHeight: 21 },
  small: { fontSize: 13, color: AP.mutedForeground },
  notice: { fontSize: 14, color: AP.chart3 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  link: { color: AP.primary, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: AP.border, marginVertical: 4 },
});
