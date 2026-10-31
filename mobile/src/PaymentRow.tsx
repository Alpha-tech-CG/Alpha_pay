import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AP, radius, soft } from '@/design';
import { ucFont } from '@/uc';
import { StatusPill } from '@/dash';
import { ago, OPERATOR_LABEL, STATUS_LABEL, statusTone } from '@/format';
import type { Payment } from '@/api';

const NET: Record<string, { short: string; fg: string; bg: string }> = {
  mtn: { short: 'MTN', fg: '#7A5C00', bg: soft.mtn20 },
  airtel: { short: 'ART', fg: AP.airtel, bg: soft.chart4_10 },
  card: { short: 'CB', fg: AP.primary, bg: soft.primary10 },
};

export function PaymentRow({ p }: { p: Payment }) {
  const router = useRouter();
  const net = NET[p.operator] ?? NET.mtn;
  const who = p.card?.last4 ? `${p.card.brand ?? 'Carte'} •••• ${p.card.last4}` : p.payer_phone ?? OPERATOR_LABEL[p.operator] ?? p.operator;
  return (
    <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/(merchant)/payment/${p.id}`)}>
      <View style={[s.net, { backgroundColor: net.bg }]}>
        <Text style={[s.netText, { color: net.fg }]}>{net.short}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.name} numberOfLines={1}>{p.description || p.reference || who}</Text>
        <Text style={s.meta} numberOfLines={1}>{who} · {ago(p.created_at)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={s.amount}>{p.amount_display}</Text>
        <StatusPill label={STATUS_LABEL[p.status] ?? p.status} tone={statusTone(p.status)} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: AP.border },
  net: { width: 40, height: 40, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  netText: { fontSize: 11, fontFamily: ucFont.condensed, fontWeight: '700' },
  name: { fontSize: 15, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  meta: { fontSize: 12, color: AP.mutedForeground },
  amount: { fontSize: 15, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary, fontVariant: ['tabular-nums'] },
});
