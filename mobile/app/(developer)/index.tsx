import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, radius, shadow, font } from '@/design';

const CODE = [
  "const alpha = require('@alphapay/node');",
  '// Initialize with Secret Key',
  "const client = alpha.init('sk_live_...');",
  'await client.payments.create({',
  '  amount: 25000,',
  "  currency: 'XAF',",
  "  method: 'momo_congo',",
  "  customer: '242060000000'",
  '});',
];

const FEATURES = [
  { icon: 'north-east', title: 'Unified API', text: 'One endpoint for all networks and payment corridors across Africa.' },
  { icon: 'code', title: 'Sandbox Env', text: 'Test your full payment flow without moving real money.' },
  { icon: 'public', title: 'Remittances', text: 'Cross-border payments between CEMAC, Libya, and the global economy.' },
];

export default function DevLanding() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.brandRow}>
          <View style={s.logo}><Text style={s.logoText}>α</Text></View>
          <Text style={s.brand}>AlphaPay <Text style={s.brandTag}>DEV</Text></Text>
        </View>

        <View style={s.badge}>
          <View style={s.badgeDot} />
          <Text style={s.badgeText}>API V2.4 Now Available</Text>
        </View>
        <Text style={s.title}>BUILD THE FUTURE OF PAYMENTS IN <Text style={{ color: AP.primary }}>AFRICA.</Text></Text>
        <Text style={s.sub}>One unified API to accept MTN MoMo, Airtel Money, and card payments across CEMAC and North Africa.</Text>

        <Pressable style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.9 }]} onPress={() => router.push('/(developer)/sandbox')}>
          <Text style={s.primaryText}>Get Started</Text>
          <Icon name="code" size={20} color={AP.secondary} />
        </Pressable>
        <Pressable style={s.ghostBtn} onPress={() => router.push('/(developer)/docs')}>
          <Text style={s.ghostText}>View Documentation</Text>
          <Icon name="chevron-right" size={18} color="#fff" />
        </Pressable>

        {/* Code card */}
        <View style={s.codeCard}>
          <View style={s.codeBar}>
            <View style={s.dots}>
              <View style={[s.wdot, { backgroundColor: '#FF5F56' }]} />
              <View style={[s.wdot, { backgroundColor: '#FFBD2E' }]} />
              <View style={[s.wdot, { backgroundColor: '#27C93F' }]} />
            </View>
            <Text style={s.codeFile}>checkout_session.js</Text>
          </View>
          <View style={s.codeBody}>
            {CODE.map((l, i) => (
              <View key={i} style={s.codeLineRow}>
                <Text style={s.codeNum}>{i + 1}</Text>
                <Text style={s.codeText}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Features */}
        <View style={{ gap: 16, marginTop: 32 }}>
          {FEATURES.map((f) => (
            <View key={f.title} style={s.feature}>
              <View style={s.featureIcon}><Icon name={f.icon} size={26} color={AP.primary} /></View>
              <Text style={s.featureTitle}>{f.title}</Text>
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={s.cta}>
          <Text style={s.ctaTitle}>READY TO INTEGRATE?</Text>
          <Text style={s.ctaSub}>Join hundreds of developers building the next generation of African fintech.</Text>
          <Pressable style={s.ctaBtn}><Text style={s.ctaBtnText}>Get API Keys</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B15' },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 120 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  logo: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: AP.primary, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 24, fontWeight: '900', color: AP.secondary, marginTop: -2 },
  brand: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  brandTag: { fontSize: 10, fontWeight: '900', letterSpacing: 2, color: AP.primary },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: 'rgba(0,180,216,0.1)', borderWidth: 1, borderColor: 'rgba(0,180,216,0.2)', marginBottom: 20 },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AP.primary },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: AP.primary, textTransform: 'uppercase' },
  title: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1.5, lineHeight: 40 },
  sub: { fontSize: 16, color: 'rgba(255,255,255,0.4)', lineHeight: 24, marginTop: 20 },

  primaryBtn: { marginTop: 28, height: 60, backgroundColor: AP.primary, borderRadius: radius.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...shadow(14, AP.primary, 0.25) },
  primaryText: { fontSize: 17, fontWeight: '900', color: AP.secondary },
  ghostBtn: { marginTop: 12, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ghostText: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#fff', textTransform: 'uppercase' },

  codeCard: { marginTop: 28, backgroundColor: 'rgba(13,17,23,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: radius.xxl, overflow: 'hidden' },
  codeBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.03)' },
  dots: { flexDirection: 'row', gap: 8 },
  wdot: { width: 12, height: 12, borderRadius: 6 },
  codeFile: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', fontFamily: font.mono, textTransform: 'uppercase' },
  codeBody: { padding: 20, gap: 4 },
  codeLineRow: { flexDirection: 'row', gap: 12 },
  codeNum: { width: 16, textAlign: 'right', color: 'rgba(255,255,255,0.15)', fontFamily: font.mono, fontSize: 12 },
  codeText: { flex: 1, color: '#79c0ff', fontFamily: font.mono, fontSize: 12, lineHeight: 20 },

  feature: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: radius.xxl, padding: 24, gap: 12 },
  featureIcon: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  featureText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 22 },

  cta: { marginTop: 40, backgroundColor: 'rgba(0,180,216,0.08)', borderWidth: 1, borderColor: 'rgba(0,180,216,0.15)', borderRadius: 28, padding: 32, alignItems: 'center', gap: 16 },
  ctaTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -1, textAlign: 'center' },
  ctaSub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 22 },
  ctaBtn: { marginTop: 8, height: 56, paddingHorizontal: 40, backgroundColor: '#fff', borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 1, color: AP.secondary, textTransform: 'uppercase' },
});
