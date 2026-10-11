import { useState } from 'react';
import { View, Text, Image, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Label, PrimaryButton, Wordmark, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';

const HERO = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1080&q=80';

export default function Onboarding() {
  const router = useRouter();
  useStatusBar('light');
  const [phone, setPhone] = useState('');

  const digits = phone.replace(/\D/g, '');
  const valid = digits.length >= 8;

  const onContinue = () => {
    if (!valid) return Alert.alert('Numéro de téléphone', 'Saisissez un numéro valide pour continuer.');
    router.replace('/(client)/(tabs)');
  };

  return (
    <View style={s.root}>
      {/* Visuel */}
      <View style={s.hero}>
        <LinearGradient colors={['#3B4A2F', '#8A9A3A']} style={StyleSheet.absoluteFill} />
        <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['top']} style={s.heroSafe}>
          <Wordmark size={22} />
          <View>
            <Text style={s.heroTitle}>Bienvenue{'\n'}sur AlphaPay</Text>
            <Text style={s.heroSub}>La passerelle vers l'économie numérique.</Text>
          </View>
        </SafeAreaView>
      </View>

      {/* Formulaire */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView edges={['bottom']} style={s.form}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Commencer</Text>
            <Text style={s.sub}>Saisissez votre numéro pour créer votre portefeuille.</Text>

            <Label style={{ marginTop: 26 }}>Numéro de téléphone</Label>
            <View style={s.phoneRow}>
              <Text style={s.code}>🇨🇬 +242</Text>
              <TextInput
                style={s.phoneInput}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="06 123 4567"
                placeholderTextColor={UC.line}
              />
            </View>

            <View style={s.note}>
              <Icon name="shield-check" size={20} color={UC.teal} />
              <Text style={s.noteText}>
                En continuant, vous acceptez les <Text style={s.link}>Conditions d'utilisation</Text> et la{' '}
                <Text style={s.link}>Politique de confidentialité</Text> d'AlphaPay. Un code de vérification vous sera envoyé par SMS.
              </Text>
            </View>
          </View>
          <PrimaryButton label="Continuer" disabled={!valid} onPress={onContinue} />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  hero: { height: '38%', backgroundColor: UC.dark },
  heroSafe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  heroTitle: { fontFamily: ucFont.condensed, fontSize: 34, fontWeight: '700', color: UC.white, lineHeight: 40 },
  heroSub: { fontFamily: ucFont.regular, fontSize: 16, color: UC.white, marginTop: 4 },

  form: { flex: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12 },
  title: { fontFamily: ucFont.condensed, fontSize: 28, fontWeight: '700', color: UC.ink },
  sub: { fontFamily: ucFont.regular, fontSize: 16, color: UC.inkSoft, marginTop: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: UC.line },
  code: { fontFamily: ucFont.condensed, fontSize: 21, fontWeight: '700', color: UC.ink },
  phoneInput: { flex: 1, fontFamily: ucFont.condensed, fontSize: 26, fontWeight: '700', color: UC.ink, paddingVertical: 8 },
  note: { flexDirection: 'row', gap: 10, backgroundColor: UC.bgGrey, borderRadius: 8, padding: 14, marginTop: 24 },
  noteText: { flex: 1, fontFamily: ucFont.regular, fontSize: 13, color: UC.inkSoft, lineHeight: 19 },
  link: { color: UC.teal, fontWeight: '700' },
});
