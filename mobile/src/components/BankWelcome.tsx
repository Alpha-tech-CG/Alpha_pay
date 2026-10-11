// Intro animée (LogoIntro) + écran d'accueil « photo plein écran » (design banque).
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { Wordmark, useAmountsHidden } from '@/components/UcKit';
export { LogoIntro as BankSplash } from '@/components/LogoIntro';
import { UC, ucFont } from '@/uc';

// Paysage en fond (chargé à la volée ; le dégradé vert reste si hors-ligne).
const BG = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1080&q=80';

export function BankWelcome({
  onLogin, onSignup, onMerchant, onDeveloper, onPending,
}: {
  onLogin: () => void; onSignup: () => void; onMerchant: () => void; onDeveloper: () => void; onPending: () => void;
}) {
  const [lang, setLang] = useState<'FR' | 'ENG'>('FR');
  const [hidden, toggleHidden] = useAmountsHidden();
  const fr = lang === 'FR';
  // Fondu d'entrée, en relais de la sortie de l'intro animée.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <Animated.View style={[s.root, { opacity: fade }]}>
      <StatusBar style="light" />
      <LinearGradient colors={['#3B4A2F', '#5E7A35', '#8A9A3A', '#4E6B2A']} style={StyleSheet.absoluteFill} />
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']} locations={[0, 0.35, 0.6, 1]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={s.top}>
          <Wordmark size={22} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['FR', 'ENG'] as const).map((l) => (
              <Pressable key={l} onPress={() => setLang(l)} style={[s.lang, lang === l && s.langOn]}>
                <Text style={[s.langText, lang === l && { color: UC.ink }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.hello}>
          <Text style={s.helloTitle}>{fr ? 'Bonjour,\nbon retour' : 'Hello,\nwelcome back'}</Text>
          <Text style={s.helloSub}>
            {fr ? 'Connectez-vous avec votre empreinte ou le PIN de votre compte AlphaPay' : 'Sign in with your fingerprint or your AlphaPay PIN'}
          </Text>
        </View>

        <Pressable style={s.privacy} onPress={toggleHidden}>
          <View style={s.eye}><Icon name={hidden ? 'eye-off' : 'eye'} size={14} color={UC.ink} /></View>
          <Text style={s.privacyText}>
            {fr ? `MODE « MASQUER LES MONTANTS » ${hidden ? 'ACTIVÉ' : 'DÉSACTIVÉ'}` : `"HIDE AMOUNTS" MODE ${hidden ? 'ON' : 'OFF'}`}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <View style={s.bottom}>
          <Pressable style={({ pressed }) => [s.loginBtn, pressed && { opacity: 0.9 }]} onPress={onLogin}>
            <Text style={s.loginText}>{fr ? 'SE CONNECTER' : 'SIGN IN'}</Text>
          </Pressable>
          <Pressable style={s.link} onPress={onPending}>
            <Text style={s.linkText}>{fr ? 'UN PROBLÈME DE CONNEXION ?' : 'TROUBLE SIGNING IN?'}</Text>
            <Icon name="chevron-right" size={16} color={UC.white} />
          </Pressable>
          <View style={s.links}>
            <Pressable style={s.link} onPress={onSignup}>
              <Text style={s.linkText}>{fr ? 'OUVRIR UN COMPTE' : 'OPEN ACCOUNT'}</Text>
              <Icon name="chevron-right" size={16} color={UC.white} />
            </Pressable>
            <Pressable style={s.link} onPress={onMerchant}>
              <Text style={s.linkText}>{fr ? 'MARCHAND' : 'MERCHANT'}</Text>
              <Icon name="chevron-right" size={16} color={UC.white} />
            </Pressable>
            <Pressable style={s.link} onPress={onDeveloper}>
              <Text style={s.linkText}>{fr ? 'DÉVELOPPEUR' : 'DEVELOPER'}</Text>
              <Icon name="chevron-right" size={16} color={UC.white} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const shadowText = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3B4A2F' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },
  lang: { height: 34, minWidth: 46, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1.5, borderColor: UC.white, alignItems: 'center', justifyContent: 'center' },
  langOn: { backgroundColor: UC.white },
  langText: { fontFamily: ucFont.condensed, fontSize: 14, fontWeight: '700', color: UC.white },

  hello: { paddingHorizontal: 16, marginTop: 28 },
  helloTitle: { fontFamily: ucFont.condensed, fontSize: 32, fontWeight: '700', color: UC.white, lineHeight: 38, ...shadowText },
  helloSub: { fontFamily: ucFont.regular, fontSize: 16, color: UC.white, marginTop: 4, ...shadowText },

  privacy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 40 },
  eye: { width: 24, height: 24, borderRadius: 12, backgroundColor: UC.white, alignItems: 'center', justifyContent: 'center' },
  privacyText: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', color: UC.white, ...shadowText },

  bottom: { paddingHorizontal: 16, paddingBottom: 16 },
  loginBtn: { height: 55, borderRadius: 5, backgroundColor: UC.white, alignItems: 'center', justifyContent: 'center' },
  loginText: { fontFamily: ucFont.regular, fontSize: 19, color: UC.ink, letterSpacing: 0.5 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 22 },
  linkText: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', color: UC.white, ...shadowText },
});
