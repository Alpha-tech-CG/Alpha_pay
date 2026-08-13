import { useState } from 'react';
import { View, Text, Pressable, Image, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';

const HERO = 'https://ggrhecslgdflloszjkwl.supabase.co/storage/v1/object/public/user-assets/o4RyJLEHreE/components/iu1JFNVysAY.jpeg';

export default function Onboarding() {
  const router = useRouter();
  const [phone, setPhone] = useState('');

  const digits = phone.replace(/\D/g, '');
  const valid = digits.length >= 8;

  const onContinue = () => {
    if (!valid) return Alert.alert('Phone number', 'Enter a valid phone number to continue.');
    router.replace('/(client)/(tabs)');
  };

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={s.hero}>
        <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill as never} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(245,247,250,0.2)', AP.bg]}
          style={StyleSheet.absoluteFill as never}
        />
        <SafeAreaView edges={['top']} style={s.heroSafe}>
          <View style={s.heroContent}>
            <View style={s.dots}>
              <View style={[s.dot, { backgroundColor: AP.primary }]} />
              <View style={[s.dot, { backgroundColor: 'rgba(226,232,240,0.6)' }]} />
              <View style={[s.dot, { backgroundColor: 'rgba(226,232,240,0.6)' }]} />
            </View>
            <Text style={s.heroTitle}>Welcome to AlphaPay</Text>
            <Text style={s.heroSub}>The bridge to the digital economy.</Text>
          </View>
        </SafeAreaView>
      </View>

      {/* Form */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.formWrap}>
        <SafeAreaView edges={['bottom']} style={s.form}>
          <View style={{ flex: 1 }}>
            <Text style={s.getStarted}>Get Started</Text>
            <Text style={s.getStartedSub}>Enter your phone number to create your wallet.</Text>

            <Text style={s.label}>Phone Number</Text>
            <View style={s.phoneRow}>
              <View style={s.country}>
                <Text style={s.flag}>🇨🇬</Text>
                <Text style={s.code}>+242</Text>
              </View>
              <TextInput
                style={s.phoneInput}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="06 123 4567"
                placeholderTextColor="rgba(11,30,61,0.35)"
              />
            </View>

            <View style={s.note}>
              <View style={s.noteIcon}>
                <Icon name="shield-check" size={24} color={AP.primary} />
              </View>
              <Text style={s.noteText}>
                By continuing, you agree to AlphaPay's <Text style={s.noteLink}>Terms of Service</Text> and{' '}
                <Text style={s.noteLink}>Privacy Policy</Text>. We'll send you an OTP to verify your number.
              </Text>
            </View>
          </View>

          <Pressable style={({ pressed }) => [s.cta, pressed && { transform: [{ scale: 0.98 }] }, !valid && { opacity: 0.6 }]} onPress={onContinue}>
            <Text style={s.ctaText}>Continue</Text>
            <Icon name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  hero: { height: '40%', backgroundColor: AP.secondary },
  heroSafe: { flex: 1, justifyContent: 'flex-end' },
  heroContent: { paddingHorizontal: 24, paddingBottom: 24 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  dot: { height: 6, flex: 1, borderRadius: 3 },
  heroTitle: { fontSize: 30, fontWeight: '800', color: AP.secondary },
  heroSub: { fontSize: 14, color: AP.mutedForeground, marginTop: 4 },

  formWrap: { flex: 1 },
  form: { flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  getStarted: { fontSize: 20, fontWeight: '700', color: AP.secondary, marginBottom: 8 },
  getStartedSub: { fontSize: 14, color: AP.mutedForeground, marginBottom: 32 },

  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: AP.mutedForeground, textTransform: 'uppercase', marginLeft: 4, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', gap: 12 },
  country: { width: 108, height: 56, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow(2) },
  flag: { fontSize: 20 },
  code: { fontSize: 15, fontWeight: '700', color: AP.secondary },
  phoneInput: { flex: 1, height: 56, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, paddingHorizontal: 20, fontSize: 18, fontWeight: '700', color: AP.secondary, ...shadow(2) },

  note: { marginTop: 24, flexDirection: 'row', gap: 16, backgroundColor: soft.primary05, borderWidth: 1, borderColor: soft.primary10, borderRadius: radius.xl, padding: 16 },
  noteIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  noteText: { flex: 1, fontSize: 11, color: AP.mutedForeground, lineHeight: 18, paddingTop: 2 },
  noteLink: { color: AP.primary, fontWeight: '700' },

  cta: { height: 64, backgroundColor: AP.secondary, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...shadow(12, AP.secondary, 0.2) },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
