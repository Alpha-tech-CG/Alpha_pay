import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, font } from '@/design';
import { Segmented } from '@/dash';
import { useMerchant } from '@/merchant-store';

function KeyCard({ title, desc, value, secret }: { title: string; desc: string; value: string; secret?: boolean }) {
  const [reveal, setReveal] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const shown = reveal ? `${value}...` : '•'.repeat(24);
  const copy = async () => { await Clipboard.setStringAsync(`${value}...`); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardDesc}>{desc}</Text>
        </View>
        <Pressable><Text style={s.regen}>Regenerate</Text></Pressable>
      </View>
      <View style={s.keyRow}>
        <Pressable style={{ flex: 1 }} onPress={() => secret && setReveal((r) => !r)}>
          <Text style={s.keyCode} numberOfLines={1}>{shown}</Text>
        </Pressable>
        {secret ? (
          <Pressable style={s.keyBtn} onPress={() => setReveal((r) => !r)}><Icon name={reveal ? 'eye-off' : 'eye'} size={18} color={AP.mutedForeground} /></Pressable>
        ) : null}
        <Pressable style={s.keyBtn} onPress={copy}><Icon name={copied ? 'check' : 'content-copy'} size={18} color={copied ? AP.chart3 : AP.mutedForeground} /></Pressable>
      </View>
    </View>
  );
}

export default function ApiKeys() {
  const router = useRouter();
  const { apiKeys } = useMerchant();
  const [env, setEnv] = useState('Live');
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}><Icon name="arrow-left" size={20} color={AP.secondary} /></Pressable>
        <Text style={s.title}>API Keys</Text>
        <Segmented options={['Live', 'Test']} value={env} onChange={setEnv} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.note}>
          <Icon name="info" size={22} color={AP.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.noteTitle}>Security Best Practices</Text>
            <Text style={s.noteText}>Your Secret keys should never be exposed in client-side code. Use them only in your server environment.</Text>
          </View>
        </View>

        <KeyCard title="Public Key" desc="Identifies your account in client-side integrations." value={apiKeys.publicKey} />
        <KeyCard title="Secret Key" desc="Server-to-server communication. Keep this safe!" value={apiKeys.secretKey} secret />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },

  note: { flexDirection: 'row', gap: 16, backgroundColor: soft.primary05, borderWidth: 1, borderColor: soft.primary20, borderRadius: radius.lg, padding: 16 },
  noteTitle: { fontSize: 13, fontWeight: '800', color: AP.secondary },
  noteText: { fontSize: 12, color: AP.mutedForeground, lineHeight: 18, marginTop: 4 },

  card: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.lg, padding: 20, gap: 16, ...shadow(2) },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: AP.secondary },
  cardDesc: { fontSize: 12, color: AP.mutedForeground, marginTop: 4 },
  regen: { fontSize: 12, fontWeight: '800', color: AP.primary },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyCode: { backgroundColor: soft.muted50, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontFamily: font.mono, fontSize: 13, color: AP.secondary },
  keyBtn: { width: 44, height: 44, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: AP.card },
});
