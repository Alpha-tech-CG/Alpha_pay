import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { B, F } from '@/brand';
import { Amount, BrandTile, Divider } from '@/bank';
import { FadeIn, PressScale } from '@/motion';
import { ago, OPERATOR_LABEL, STATUS_LABEL } from '@/format';
import type { Payment } from '@/api';

/** Ligne de paiement (accueil, paiements, cartes), entrée échelonnée. */
export function PaymentRow({ p, last, index = 0 }: { p: Payment; last?: boolean; index?: number }) {
  const router = useRouter();
  const ok = p.status === 'réussi';
  const failed = p.status === 'échoué' || p.status === 'expiré' || p.status === 'annulé';
  const who = p.card?.last4 ? `${p.card.brand ?? 'Carte'} •••• ${p.card.last4}` : p.payer_phone ?? OPERATOR_LABEL[p.operator] ?? p.operator;
  const statusColor = failed ? B.burgundy : p.status === 'en_attente' ? B.warning : B.muted;
  return (
    <FadeIn index={index}>
      <PressScale scaleTo={0.985} style={s.row} onPress={() => router.push(`/(merchant)/payment/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.amount_display}, ${STATUS_LABEL[p.status] ?? p.status}`}>
        <BrandTile brand={p.operator} size={42} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.title} numberOfLines={1}>{p.description || p.reference || who}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {!ok && <Text style={{ color: statusColor, fontFamily: F.semibold }}>{STATUS_LABEL[p.status] ?? p.status} · </Text>}
            {who} · {ago(p.created_at)}
          </Text>
        </View>
        <Amount value={p.amount} currency={p.currency} sign={ok ? '+' : undefined} size={17} color={ok ? B.success : failed ? B.muted : B.ink} style={{ maxWidth: 140 }} />
      </PressScale>
      {!last && <Divider style={{ marginLeft: 56 }} />}
    </FadeIn>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, minHeight: 64 },
  title: { fontFamily: F.medium, fontSize: 15, color: B.ink },
  sub: { fontFamily: F.regular, fontSize: 13, color: B.muted },
});
