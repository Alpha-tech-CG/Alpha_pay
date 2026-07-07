import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/auth';
import { verifyKey, loginClient, registerClient, api } from '@/api';
import { C } from '@/theme';

const DEV_SIGNUP_URL = 'https://paybrain.cg/fr/developer';

type Flow =
  | 'welcome'
  | 'choose-login'     // choisir entre client ou marchand
  | 'login-client'     // téléphone + PIN
  | 'login-merchant'   // clé API
  | 'signup-client'    // inscription wallet : identité + PIN
  | 'signup'           // inscription standard (marchand)
  | 'pending';

function Logo() {
  return (
    <View style={{ alignItems: 'center', marginBottom: 36 }}>
      <View style={s.logoBox}>
        <Text style={s.logoLetter}>P</Text>
      </View>
      <Text style={s.logoText}>PayBrain</Text>
      <Text style={s.logoSub}>Paiements Mobile Money</Text>
    </View>
  );
}

function BackBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.backBtn}>
      <MaterialIcons name="arrow-back" size={20} color={C.primary} />
      <Text style={s.backBtnText}>Retour</Text>
    </Pressable>
  );
}

function Field({
  label, optional, ...props
}: React.ComponentProps<typeof TextInput> & { label: string; optional?: boolean }) {
  return (
    <>
      <Text style={s.fieldLabel}>
        {label}
        {optional && <Text style={{ color: C.muted, fontWeight: '400' }}> (optionnel)</Text>}
      </Text>
      <TextInput placeholderTextColor={C.muted} style={s.input} {...props} />
    </>
  );
}

function ErrorRow({ msg }: { msg: string }) {
  return (
    <View style={s.errorRow}>
      <MaterialIcons name="error-outline" size={14} color={C.error} />
      <Text style={s.errorText}>{msg}</Text>
    </View>
  );
}

export default function Auth() {
  const { ready, apiKey, role, signInMerchant, signInClient } = useAuth();
  const [flow, setFlow] = useState<Flow>('welcome');

  // ── Client login state ──
  const [phone, setPhone]       = useState('');
  const [pin, setPin]           = useState('');
  const [clientBusy, setClientBusy]   = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // ── Client signup state (2 étapes : identité → PIN) ──
  const [regStep, setRegStep]         = useState<1 | 2>(1);
  const [regPhone, setRegPhone]       = useState('');
  const [regName, setRegName]         = useState('');
  const [regPin, setRegPin]           = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [regBusy, setRegBusy]         = useState(false);
  const [regError, setRegError]       = useState<string | null>(null);

  // ── Merchant login state ──
  const [apiKeyInput, setApiKeyInput]     = useState('');
  const [merchantBusy, setMerchantBusy]   = useState(false);
  const [merchantError, setMerchantError] = useState<string | null>(null);

  // ── Signup state ──
  const [fullName, setFullName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [email, setEmail]       = useState('');
  const [company, setCompany]   = useState('');
  const [signupBusy, setSignupBusy]   = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  // Loading splash
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  // Role-based redirect after login
  if (apiKey && role) {
    if (role === 'CLIENT')            return <Redirect href="/(client)/(tabs)" />;
    if (role === 'MERCHANT_CASHIER')  return <Redirect href="/(cashier)/(tabs)" />;
    return <Redirect href="/(tabs)" />;
  }

  /* ── Handlers ── */

  const submitClientLogin = async () => {
    if (!phone.trim() || pin.length < 4) return;
    setClientBusy(true); setClientError(null);
    try {
      const data = await loginClient(phone.trim(), pin.trim());
      await signInClient(data.phone, data.token, data.role as import('@/auth').UserRole);
    } catch {
      setClientError('Numéro ou PIN incorrect');
      setClientBusy(false);
    }
  };

  const submitMerchantLogin = async () => {
    if (!apiKeyInput.trim()) return;
    setMerchantBusy(true); setMerchantError(null);
    const ok = await verifyKey(apiKeyInput.trim());
    if (ok) {
      await signInMerchant(apiKeyInput.trim());
    } else {
      setMerchantError('Clé API invalide ou compte en attente de validation');
      setMerchantBusy(false);
    }
  };

  const goToSignupClient = () => {
    setRegStep(1); setRegPhone(''); setRegName('');
    setRegPin(''); setRegPinConfirm(''); setRegError(null);
    setFlow('signup-client');
  };

  const submitRegStep1 = () => {
    if (!regName.trim() || regPhone.trim().length < 8) {
      setRegError('Nom et numéro sont obligatoires');
      return;
    }
    setRegError(null);
    setRegStep(2);
  };

  const submitRegStep2 = async () => {
    if (regPin.length < 4) { setRegError('Le PIN doit faire au moins 4 chiffres'); return; }
    if (regPin !== regPinConfirm) { setRegError('Les PIN ne correspondent pas'); return; }
    setRegBusy(true); setRegError(null);
    try {
      await registerClient(regPhone.trim(), regName.trim(), regPin);
      // Auto-login après inscription
      const data = await loginClient(regPhone.trim(), regPin);
      await signInClient(data.phone, data.token);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setRegError(msg === 'Ce numéro est déjà enregistré'
        ? 'Ce numéro est déjà enregistré. Connectez-vous.'
        : 'Erreur lors de l\'inscription, réessayez.');
      setRegBusy(false);
    }
  };

  const submitSignup = async () => {
    if (!fullName.trim() || !signupPhone.trim()) {
      setSignupError('Nom et téléphone sont obligatoires');
      return;
    }
    setSignupBusy(true); setSignupError(null);
    try {
      await api.post('/v1/onboarding/standard', { fullName, phone: signupPhone, email, company });
      setFlow('pending');
    } catch {
      setSignupError('Erreur réseau, réessayez');
    } finally {
      setSignupBusy(false);
    }
  };

  /* ══════════════════════════════════════════
     WELCOME
  ══════════════════════════════════════════ */
  if (flow === 'welcome') {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={s.centered} showsVerticalScrollIndicator={false}>
          <Logo />

          <Pressable onPress={() => setFlow('choose-login')} style={s.btnPrimary}>
            <MaterialIcons name="login" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.btnPrimaryText}>Se connecter</Text>
          </Pressable>

          <Pressable onPress={goToSignupClient} style={[s.btnOutline, { marginTop: 12 }]}>
            <MaterialIcons name="account-balance-wallet" size={18} color={C.primary} style={{ marginRight: 8 }} />
            <Text style={s.btnOutlineText}>Créer un compte personnel</Text>
          </Pressable>

          <Pressable onPress={() => setFlow('signup')} style={[s.btnOutline, { marginTop: 10 }]}>
            <MaterialIcons name="store" size={18} color={C.secondary} style={{ marginRight: 8 }} />
            <Text style={[s.btnOutlineText, { color: C.secondary }]}>Compte marchand</Text>
          </Pressable>

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>Vous êtes développeur ?</Text>
            <View style={s.dividerLine} />
          </View>

          <Pressable onPress={() => Linking.openURL(DEV_SIGNUP_URL)} style={s.devBanner}>
            <View style={s.devBannerLeft}>
              <View style={s.devIconBox}>
                <MaterialIcons name="code" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.devBannerTitle}>Compte développeur</Text>
                <Text style={s.devBannerSub}>Clés API + webhooks · Inscription sur le site</Text>
              </View>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={C.primary} />
          </Pressable>

          <Pressable onPress={() => setFlow('pending')} style={{ marginTop: 20 }}>
            <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>
              J'attends la validation de mon compte →
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     CHOOSE LOGIN
  ══════════════════════════════════════════ */
  if (flow === 'choose-login') {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={s.centered} showsVerticalScrollIndicator={false}>
          <BackBtn onPress={() => setFlow('welcome')} />
          <Logo />
          <Text style={s.pageTitle}>Connexion</Text>
          <Text style={s.pageSubtitle}>Choisissez votre type de compte</Text>

          {/* Client card */}
          <Pressable onPress={() => setFlow('login-client')} style={s.roleCard}>
            <View style={[s.roleIconBox, { backgroundColor: '#eaf0ff' }]}>
              <MaterialIcons name="account-balance-wallet" size={28} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.roleCardTitle}>Compte personnel</Text>
              <Text style={s.roleCardSub}>Payer par QR code · Recharger · Envoyer</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={C.muted} />
          </Pressable>

          <View style={{ height: 12 }} />

          {/* Merchant card */}
          <Pressable onPress={() => setFlow('login-merchant')} style={s.roleCard}>
            <View style={[s.roleIconBox, { backgroundColor: '#e6f7f6' }]}>
              <MaterialIcons name="store" size={28} color={C.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.roleCardTitle}>Compte marchand / développeur</Text>
              <Text style={s.roleCardSub}>Tableau de bord · API key · Reversements</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={C.muted} />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     LOGIN CLIENT (téléphone + PIN)
  ══════════════════════════════════════════ */
  if (flow === 'login-client') {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <BackBtn onPress={() => setFlow('choose-login')} />
            <Text style={s.pageTitle}>Compte personnel</Text>
            <Text style={s.pageSubtitle}>Connectez-vous avec votre numéro et votre PIN</Text>

            <Field
              label="Numéro de téléphone"
              value={phone} onChangeText={setPhone}
              placeholder="+242 065 000 000"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <Field
              label="Code PIN (4–6 chiffres)"
              value={pin} onChangeText={setPin}
              placeholder="••••"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />

            {clientError && <ErrorRow msg={clientError} />}

            <Pressable
              onPress={submitClientLogin}
              disabled={clientBusy || !phone.trim() || pin.length < 4}
              style={[s.btnPrimary, (clientBusy || !phone.trim() || pin.length < 4) && s.btnDisabled]}
            >
              {clientBusy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimaryText}>Se connecter</Text>}
            </Pressable>

            <Text style={s.secureNote}>🔒 PIN vérifié localement · jamais stocké en clair</Text>

            <Pressable onPress={goToSignupClient} style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>
                Nouveau ? Créer un compte →
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     LOGIN MERCHANT (API key)
  ══════════════════════════════════════════ */
  if (flow === 'login-merchant') {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <BackBtn onPress={() => setFlow('choose-login')} />
            <Text style={s.pageTitle}>Compte marchand</Text>
            <Text style={s.pageSubtitle}>Entrez votre clé API reçue par email</Text>

            <Field
              label="Clé API"
              value={apiKeyInput} onChangeText={setApiKeyInput}
              placeholder="pk_live_…"
              autoCapitalize="none" autoCorrect={false} secureTextEntry
            />

            {merchantError && <ErrorRow msg={merchantError} />}

            <Pressable
              onPress={submitMerchantLogin}
              disabled={merchantBusy || !apiKeyInput.trim()}
              style={[s.btnPrimary, (!apiKeyInput.trim() || merchantBusy) && s.btnDisabled]}
            >
              {merchantBusy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimaryText}>Se connecter</Text>}
            </Pressable>

            <Text style={s.secureNote}>🔒 Clé stockée chiffrée sur l'appareil</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     SIGNUP CLIENT — étape 1 : identité
  ══════════════════════════════════════════ */
  if (flow === 'signup-client' && regStep === 1) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <BackBtn onPress={() => setFlow('choose-login')} />
            <Text style={s.pageTitle}>Nouveau compte</Text>
            <Text style={s.pageSubtitle}>Créez votre portefeuille mobile en quelques secondes</Text>

            <View style={s.stepRow}>
              <View style={s.stepDot} />
              <View style={[s.stepLine, { backgroundColor: C.border }]} />
              <View style={[s.stepDot, { backgroundColor: C.border }]} />
            </View>
            <Text style={s.stepLabel}>Étape 1 / 2 — Vos informations</Text>

            <Field label="Nom complet *" value={regName} onChangeText={setRegName} placeholder="Jean-Paul Kambou" autoComplete="name" />
            <Field
              label="Numéro de téléphone *"
              value={regPhone} onChangeText={setRegPhone}
              placeholder="+242 065 000 000"
              keyboardType="phone-pad" autoComplete="tel"
            />

            {regError && <ErrorRow msg={regError} />}

            <Pressable
              onPress={submitRegStep1}
              disabled={!regName.trim() || regPhone.trim().length < 8}
              style={[s.btnPrimary, (!regName.trim() || regPhone.trim().length < 8) && s.btnDisabled]}
            >
              <Text style={s.btnPrimaryText}>Continuer</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </Pressable>

            <Pressable onPress={() => setFlow('login-client')} style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>J'ai déjà un compte → Se connecter</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     SIGNUP CLIENT — étape 2 : choix du PIN
  ══════════════════════════════════════════ */
  if (flow === 'signup-client' && regStep === 2) {
    const pinOk = regPin.length >= 4 && regPin === regPinConfirm;
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <BackBtn onPress={() => { setRegError(null); setRegStep(1); }} />
            <Text style={s.pageTitle}>Choisissez votre PIN</Text>
            <Text style={s.pageSubtitle}>
              Ce PIN protège votre portefeuille. Ne le partagez jamais.
            </Text>

            <View style={s.stepRow}>
              <View style={[s.stepDot, { backgroundColor: C.secondary }]} />
              <View style={[s.stepLine, { backgroundColor: C.secondary }]} />
              <View style={s.stepDot} />
            </View>
            <Text style={s.stepLabel}>Étape 2 / 2 — Sécurité</Text>

            <Field
              label="PIN (4 à 6 chiffres) *"
              value={regPin} onChangeText={setRegPin}
              placeholder="••••"
              keyboardType="number-pad" secureTextEntry maxLength={6}
            />
            <Field
              label="Confirmer le PIN *"
              value={regPinConfirm} onChangeText={setRegPinConfirm}
              placeholder="••••"
              keyboardType="number-pad" secureTextEntry maxLength={6}
            />

            {regPin.length >= 4 && regPin !== regPinConfirm && !regError && (
              <ErrorRow msg="Les PIN ne correspondent pas" />
            )}
            {regError && <ErrorRow msg={regError} />}

            <View style={[s.infoBox, { marginBottom: 20 }]}>
              <MaterialIcons name="lock" size={16} color={C.primary} />
              <Text style={s.infoText}>
                Votre PIN est haché (argon2id) · il ne quitte jamais votre appareil en clair
              </Text>
            </View>

            <Pressable
              onPress={submitRegStep2}
              disabled={regBusy || !pinOk}
              style={[s.btnPrimary, (regBusy || !pinOk) && s.btnDisabled]}
            >
              {regBusy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimaryText}>Créer mon compte</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     SIGNUP — STANDARD (marchand)
  ══════════════════════════════════════════ */
  if (flow === 'signup') {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <BackBtn onPress={() => setFlow('welcome')} />
            <Text style={s.pageTitle}>Compte marchand</Text>
            <Text style={s.pageSubtitle}>
              Encaissez des paiements Mobile Money et suivez vos reversements.
            </Text>

            <Field label="Nom complet *" value={fullName} onChangeText={setFullName} placeholder="Jean-Paul Kambou" />
            <Field label="Téléphone *" value={signupPhone} onChangeText={setSignupPhone} placeholder="+242 065 000 000" keyboardType="phone-pad" />
            <Field label="Email" optional value={email} onChangeText={setEmail} placeholder="vous@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Boutique / Entreprise" optional value={company} onChangeText={setCompany} placeholder="Nom de votre boutique" />

            {signupError && <ErrorRow msg={signupError} />}

            <View style={[s.infoBox, { marginBottom: 20 }]}>
              <MaterialIcons name="schedule" size={16} color={C.primary} />
              <Text style={s.infoText}>
                Votre demande sera examinée sous 24–48h. Vous recevrez votre clé API par SMS et email.
              </Text>
            </View>

            <Pressable
              onPress={submitSignup}
              disabled={signupBusy || !fullName.trim() || !signupPhone.trim()}
              style={[s.btnPrimary, (signupBusy || !fullName.trim() || !signupPhone.trim()) && s.btnDisabled]}
            >
              {signupBusy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimaryText}>Envoyer ma demande</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════════════════
     PENDING
  ══════════════════════════════════════════ */
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.centered} showsVerticalScrollIndicator={false}>
        <View style={s.pendingIcon}>
          <MaterialIcons name="hourglass-empty" size={32} color={C.pending} />
        </View>
        <Text style={s.pendingTitle}>Demande en cours d'examen</Text>
        <Text style={s.pendingText}>
          Notre équipe vérifie votre inscription.{'\n'}
          Vous recevrez votre clé API par SMS et email{'\n'}
          sous 24–48h ouvrées.
        </Text>
        <View style={[s.infoBox, { marginBottom: 24 }]}>
          <MaterialIcons name="mail-outline" size={16} color={C.pending} />
          <Text style={[s.infoText, { color: C.pending }]}>
            Vérifiez vos spams si vous ne recevez rien après 48h.
          </Text>
        </View>
        <Pressable onPress={() => setFlow('login-merchant')} style={s.btnPrimary}>
          <MaterialIcons name="vpn-key" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.btnPrimaryText}>J'ai ma clé — Se connecter</Text>
        </Pressable>
        <Pressable onPress={() => setFlow('welcome')} style={{ marginTop: 16 }}>
          <Text style={{ color: C.muted, fontSize: 13 }}>← Retour à l'accueil</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  scroll: { padding: 24, paddingBottom: 48 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 24 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: C.primary },

  logoBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoLetter: { color: '#fff', fontSize: 34, fontWeight: '900' },
  logoText: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  logoSub: { fontSize: 14, color: C.muted, marginTop: 4 },

  pageTitle: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5, marginBottom: 6 },
  pageSubtitle: { fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 20 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, marginTop: 4 },
  input: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 15, color: C.text, marginBottom: 14 },

  btnPrimary: { backgroundColor: C.primary, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnOutline: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnOutlineText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  btnDisabled: { backgroundColor: C.surfaceContainerHigh, shadowOpacity: 0 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '600', color: C.muted },

  devBanner: { backgroundColor: C.surfaceContainerLow, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  devBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  devIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  devBannerTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  devBannerSub: { fontSize: 12, color: C.muted, marginTop: 1 },

  roleCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  roleIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleCardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  roleCardSub: { fontSize: 12, color: C.muted },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText: { color: C.error, fontSize: 13, flex: 1 },
  secureNote: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 12 },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.surfaceContainerLow, borderRadius: 12, padding: 14 },
  infoText: { fontSize: 13, color: C.primary, flex: 1, lineHeight: 18 },

  pendingIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.pendingBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  pendingTitle: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 12 },
  pendingText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  stepLine: { flex: 1, height: 2, backgroundColor: C.primary, marginHorizontal: 6 },
  stepLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 20 },
});
