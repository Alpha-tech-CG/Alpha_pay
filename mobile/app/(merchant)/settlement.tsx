import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AP, soft, radius, shadow } from '@/design';
import { Card, SectionTitle, StatusPill } from '@/dash';
import { useMerchant } from '@/merchant-store';

export default function Settlement() {
  const { settlement } = useMerchant();
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Settlements</Text>
        <Pressable style={s.settingsBtn}><Text style={s.settingsText}>Payout Settings</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={s.statLabel}>Available for payout</Text>
          <Text style={s.statBig}>{settlement.available}</Text>
          <Pressable
            style={({ pressed }) => [s.payoutBtn, pressed && { opacity: 0.9 }]}
            onPress={() => Alert.alert('Payout requested', `${settlement.available} will be sent to your bank.`)}
          >
            <Text style={s.payoutText}>Request Instant Payout</Text>
          </Pressable>
        </Card>

        <View style={s.twoCol}>
          <Card style={{ flex: 1 }}>
            <Text style={s.statLabel}>Pending</Text>
            <Text style={[s.statMid, { color: AP.mutedForeground }]}>{settlement.pending}</Text>
            <Text style={s.hint}>Processing (last 24h).</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={s.statLabel}>Total Paid Out</Text>
            <Text style={s.statMid}>{settlement.totalPaid}</Text>
            <Text style={[s.hint, { color: AP.chart3, fontWeight: '800' }]}>ACTIVE SINCE 2024</Text>
          </Card>
        </View>

        <View style={{ marginTop: 24 }}>
          <SectionTitle>Payout History</SectionTitle>
          <View style={{ gap: 12 }}>
            {settlement.history.map((h) => (
              <Card key={h.id}>
                <View style={s.histTop}>
                  <Text style={s.histRef}>{h.id}</Text>
                  <StatusPill label={h.status} tone="ok" />
                </View>
                <Text style={s.histAmount}>{h.amount}</Text>
                <View style={s.histMeta}>
                  <Text style={s.histDest}>{h.dest}</Text>
                  <Text style={s.histDate}>{h.date}</Text>
                </View>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: AP.secondary },
  settingsBtn: { height: 40, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  settingsText: { fontSize: 12, fontWeight: '800', color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },

  statLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: AP.mutedForeground, textTransform: 'uppercase', marginBottom: 8 },
  statBig: { fontSize: 26, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  statMid: { fontSize: 20, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 10, color: AP.mutedForeground, marginTop: 12, letterSpacing: 0.5, lineHeight: 15 },
  payoutBtn: { marginTop: 20, height: 44, backgroundColor: AP.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', ...shadow(6, AP.primary, 0.2) },
  payoutText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  twoCol: { flexDirection: 'row', gap: 12, marginTop: 12 },

  histTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  histRef: { fontSize: 12, fontWeight: '800', color: AP.mutedForeground, fontVariant: ['tabular-nums'] },
  histAmount: { fontSize: 18, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  histMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  histDest: { fontSize: 12, color: AP.mutedForeground },
  histDate: { fontSize: 12, color: AP.mutedForeground },
});
