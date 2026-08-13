import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, radius, font } from '@/design';

const SECTIONS = ['Introduction', 'Authentication', 'Errors', 'Payments', 'Webhooks'];

const CURL = [
  'curl https://api.alphapay.africa/v1/payments \\',
  '  -u sk_live_...: \\',
  '  -d amount=2000 \\',
  '  -d currency="XAF" \\',
  '  -d description="Order #1024"',
];
const RESP = ['{', '  "id": "pay_823190",', '  "status": "succeeded",', '  "amount": 2000,', '  "currency": "XAF"', '}'];

function Code({ lines, tint = '#79c0ff' }: { lines: string[]; tint?: string }) {
  return (
    <View style={s.code}>
      {lines.map((l, i) => <Text key={i} style={[s.codeLine, { color: tint }]}>{l}</Text>)}
    </View>
  );
}

export default function DevDocs() {
  const [active, setActive] = useState('Introduction');
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <View style={s.crumbs}>
          <Text style={s.crumbMuted}>Docs</Text>
          <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.3)" />
          <Text style={s.crumb}>{active}</Text>
        </View>
        <Pressable style={s.dashBtn}><Text style={s.dashText}>Dashboard</Text></Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.navScroll} contentContainerStyle={s.nav}>
        {SECTIONS.map((sec) => {
          const on = sec === active;
          return (
            <Pressable key={sec} style={[s.navChip, on && s.navChipOn]} onPress={() => setActive(sec)}>
              <Text style={[s.navText, { color: on ? AP.primary : 'rgba(255,255,255,0.5)' }]}>{sec}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Introduction</Text>
        <Text style={s.p}>Welcome to the AlphaPay API reference. AlphaPay provides a unified payment infrastructure to collect money via mobile money (MTN, Airtel) and bank cards in Central and North Africa.</Text>

        <Text style={s.h2}>Base URL</Text>
        <Text style={s.p}>All API requests should be made over HTTPS to our base URL:</Text>
        <Code lines={['https://api.alphapay.africa/v1']} tint={AP.primary} />

        <Text style={s.h2}>Authentication</Text>
        <Text style={s.p}>The AlphaPay API uses API keys to authenticate requests. Provide your secret key in the Authorization header.</Text>
        <View style={s.warn}>
          <Icon name="error-outline" size={20} color={AP.primary} />
          <Text style={s.warnText}>Your API keys carry many privileges. Never share your secret keys in publicly accessible areas such as GitHub.</Text>
        </View>

        <Text style={s.label}>Example Request</Text>
        <Code lines={CURL} />
        <Text style={s.label}>Response Body</Text>
        <Code lines={RESP} tint="#c9d1d9" />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  crumbMuted: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  crumb: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  dashBtn: { height: 36, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dashText: { fontSize: 12, fontWeight: '800', color: AP.secondary },

  navScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  nav: { gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  navChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.04)' },
  navChipOn: { backgroundColor: 'rgba(0,180,216,0.12)', borderWidth: 1, borderColor: 'rgba(0,180,216,0.2)' },
  navText: { fontSize: 12, fontWeight: '800' },

  scroll: { padding: 24, paddingBottom: 120 },
  h1: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  h2: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 32, marginBottom: 12 },
  p: { fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 24, marginTop: 12 },
  code: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: radius.md, padding: 16, marginTop: 16 },
  codeLine: { fontFamily: font.mono, fontSize: 12, lineHeight: 20 },
  warn: { flexDirection: 'row', gap: 16, backgroundColor: 'rgba(0,180,216,0.06)', borderWidth: 1, borderColor: 'rgba(0,180,216,0.2)', borderRadius: radius.lg, padding: 16, marginTop: 16 },
  warnText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 20 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginTop: 28, marginBottom: 4 },
});
