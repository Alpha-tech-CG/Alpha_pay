import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';
import { StatusPill } from '@/dash';
import { payLinks as SEED, type PayLink } from '@/merchant-data';

export default function PaymentLinks() {
  const [links, setLinks] = useState<PayLink[]>(SEED);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (l: PayLink) => {
    await Clipboard.setStringAsync(`https://alphapay.africa/pay/${l.id}`);
    setCopiedId(l.id);
    setTimeout(() => setCopiedId(null), 1500);
  };
  const toggle = (id: string) =>
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, status: l.status === 'active' ? 'disabled' : 'active' } : l)));

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Payment Links</Text>
        <Pressable style={s.addBtn}>
          <Icon name="add" size={16} color="#fff" />
          <Text style={s.addText}>Create</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {links.map((l) => {
          const active = l.status === 'active';
          return (
            <View key={l.id} style={[s.card, !active && { opacity: 0.85 }]}>
              <View style={s.cardTop}>
                <StatusPill label={l.status} tone={active ? 'ok' : 'muted'} />
                <Icon name="settings" size={18} color={AP.mutedForeground} />
              </View>
              <Text style={s.linkTitle}>{l.title}</Text>
              <Text style={s.linkDetail}>{l.detail}</Text>
              <View style={s.paidRow}>
                <Text style={s.paidLabel}>Total Paid</Text>
                <Text style={s.paidValue}>{l.totalPaid}</Text>
              </View>
              {active ? (
                <View style={s.actions}>
                  <Pressable style={s.copyBtn} onPress={() => copy(l)}>
                    <Icon name={copiedId === l.id ? 'check' : 'content-copy'} size={16} color={AP.secondary} />
                    <Text style={s.copyText}>{copiedId === l.id ? 'Copied' : 'Copy Link'}</Text>
                  </Pressable>
                  <Pressable style={s.shareBtn} onPress={() => copy(l)}>
                    <Icon name="share-variant" size={16} color={AP.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={s.enableBtn} onPress={() => toggle(l.id)}>
                  <Text style={s.enableText}>Enable Link</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: AP.secondary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, backgroundColor: AP.primary, borderRadius: radius.md, ...shadow(6, AP.primary, 0.2) },
  addText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  scroll: { paddingHorizontal: 20, paddingBottom: 120, gap: 16 },
  card: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 20, ...shadow(2) },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  linkTitle: { fontSize: 17, fontWeight: '800', color: AP.secondary },
  linkDetail: { fontSize: 12, color: AP.mutedForeground, marginTop: 4 },
  paidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  paidLabel: { fontSize: 13, color: AP.mutedForeground },
  paidValue: { fontSize: 14, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  copyBtn: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: soft.muted50, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md },
  copyText: { fontSize: 12, fontWeight: '800', color: AP.secondary },
  shareBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AP.border, borderRadius: radius.md },
  enableBtn: { marginTop: 16, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: soft.primary10, borderWidth: 1, borderColor: soft.primary20, borderRadius: radius.md },
  enableText: { fontSize: 12, fontWeight: '800', color: AP.primary },
});
