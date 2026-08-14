import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, font } from '@/design';
import { useMerchant } from '@/merchant-store';

export default function Webhooks() {
  const router = useRouter();
  const { webhook } = useMerchant();
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}><Icon name="arrow-left" size={20} color={AP.secondary} /></Pressable>
        <Text style={s.title}>Webhooks</Text>
        <Pressable style={s.addBtn}><Text style={s.addText}>Add Endpoint</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <View style={s.endpointRow}>
            <View style={s.okTile}><Icon name="check-circle" size={20} color={AP.chart3} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.url} numberOfLines={1}>{webhook.url}</Text>
              <Text style={s.meta}>Subscribed to {webhook.events} events • Last: {webhook.lastDelivery}</Text>
            </View>
          </View>
          <View style={s.endpointActions}>
            <Pressable style={s.editBtn}><Text style={s.editText}>Edit</Text></Pressable>
            <Pressable style={s.delBtn}><Icon name="delete-outline" size={18} color={AP.destructive} /></Pressable>
          </View>

          <Text style={s.deliveriesLabel}>Recent Deliveries</Text>
          <View style={{ gap: 10 }}>
            {webhook.deliveries.map((d) => (
              <View key={d.id} style={s.delivery}>
                <View style={s.deliveryLeft}>
                  <Text style={s.code}>{d.code}</Text>
                  <Text style={s.event}>{d.event}</Text>
                </View>
                <Text style={s.at}>{d.at}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: AP.secondary },
  addBtn: { height: 40, paddingHorizontal: 16, backgroundColor: AP.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', ...shadow(6, AP.primary, 0.2) },
  addText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  card: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.lg, padding: 20, ...shadow(2) },
  endpointRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  okTile: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: soft.chart3_10, alignItems: 'center', justifyContent: 'center' },
  url: { fontSize: 13, fontWeight: '800', color: AP.secondary, fontFamily: font.mono },
  meta: { fontSize: 11, color: AP.mutedForeground, marginTop: 4 },
  endpointActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  editBtn: { height: 38, paddingHorizontal: 20, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  editText: { fontSize: 12, fontWeight: '800', color: AP.secondary },
  delBtn: { width: 38, height: 38, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

  deliveriesLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: AP.mutedForeground, textTransform: 'uppercase', marginTop: 24, marginBottom: 12 },
  delivery: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: soft.muted50, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, padding: 12 },
  deliveryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { fontSize: 12, fontWeight: '800', color: AP.chart3, fontFamily: font.mono },
  event: { fontSize: 12, fontWeight: '700', color: AP.secondary, fontFamily: font.mono },
  at: { fontSize: 11, color: AP.mutedForeground, fontFamily: font.mono },
});
