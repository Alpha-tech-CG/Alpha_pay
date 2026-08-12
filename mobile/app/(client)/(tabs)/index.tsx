import { useMemo } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, formatXAF } from '@/design';
import { useWallet, type Transaction } from '@/wallet-store';

const TINT: Record<Transaction['tint'], { fg: string; bg: string; border: string }> = {
  primary: { fg: AP.primary, bg: soft.primary10, border: soft.primary20 },
  secondary: { fg: AP.secondary, bg: soft.secondary10, border: soft.secondary20 },
  mtn: { fg: AP.mtn, bg: soft.mtn10, border: soft.mtn20 },
  success: { fg: AP.chart3, bg: soft.chart3_10, border: soft.chart3_10 },
  failed: { fg: AP.chart4, bg: soft.chart4_10, border: soft.chart4_20 },
  chart5: { fg: AP.chart5, bg: soft.chart5_10, border: soft.chart5_10 },
};

function ActionCard({ icon, label, fg, bg, onPress }: { icon: string; label: string; fg: string; bg: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.action, pressed && s.pressed]} onPress={onPress}>
      <View style={[s.actionIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={20} color={fg} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const t = TINT[tx.tint];
  const positive = tx.direction === 'in';
  const statusColor = tx.status === 'failed' ? AP.chart4 : AP.chart3;
  const statusBg = tx.status === 'failed' ? soft.chart4_10 : soft.chart3_10;
  return (
    <View style={s.txRow}>
      <View style={s.txLeft}>
        <View style={[s.txIcon, { backgroundColor: t.bg, borderColor: t.border }]}>
          <Icon name={tx.icon} size={20} color={t.fg} />
        </View>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={s.txTitle}>{tx.title}</Text>
          <Text style={s.txSub}>{tx.subtitle}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={s.txAmount}>{positive ? '+' : '-'}{formatXAF(Math.abs(tx.amountCents))}</Text>
        <Text style={[s.txStatus, { color: statusColor, backgroundColor: statusBg }]}>
          {tx.status === 'failed' ? 'Failed' : 'Success'}
        </Text>
      </View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, balanceCents, currency, transactions } = useWallet();
  const recent = useMemo(() => transactions.slice(0, 3), [transactions]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Image source={{ uri: user.avatar }} style={s.avatar} />
            <View>
              <Text style={s.welcome}>WELCOME BACK</Text>
              <Text style={s.name}>{user.name}</Text>
            </View>
          </View>
          <Pressable style={s.bell}>
            <Icon name="bell" size={22} color={AP.foreground} />
            <View style={s.bellDot} />
          </Pressable>
        </View>

        <View style={s.balanceBlock}>
          <View style={s.balanceTop}>
            <Text style={s.balanceLabel}>Total Balance</Text>
            <View style={s.currencyChip}>
              <Text style={s.currencyText}>{currency}</Text>
              <Icon name="chevron-down" size={12} color={AP.mutedForeground} />
            </View>
          </View>
          <View style={s.balanceRow}>
            <Text style={s.balanceAmount}>{formatXAF(balanceCents)}</Text>
            <Text style={s.balanceCents}>.00</Text>
          </View>
        </View>

        <View style={s.actionsGrid}>
          <ActionCard icon="arrow-up-right" label="Send Money" fg={AP.primary} bg={soft.primary10} onPress={() => router.push('/(client)/send')} />
          <ActionCard icon="arrow-down-left" label="Receive" fg={AP.secondary} bg={soft.secondary10} onPress={() => router.push('/(client)/receive')} />
          <ActionCard icon="scan-line" label="Pay Merchant" fg={AP.chart5} bg={soft.chart5_10} onPress={() => router.push('/(client)/scan')} />
          <ActionCard icon="wallet" label="Top-up Wallet" fg={AP.chart3} bg={soft.chart3_10} onPress={() => router.push('/(client)/top-up')} />
        </View>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Recent Transactions</Text>
          <Pressable style={s.seeAll} onPress={() => router.push('/(client)/(tabs)/history')}>
            <Text style={s.seeAllText}>See all</Text>
            <Icon name="chevron-right" size={12} color={AP.primary} />
          </Pressable>
        </View>
        <View style={{ gap: 12 }}>
          {recent.map((tx) => <TxRow key={tx.id} tx={tx} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: AP.border },
  welcome: { fontSize: 11, color: AP.mutedForeground, fontWeight: '600', letterSpacing: 1 },
  name: { fontSize: 16, fontWeight: '600', color: AP.foreground },
  bell: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 11, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: AP.chart4 },

  balanceBlock: { paddingVertical: 8, gap: 4 },
  balanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 14, fontWeight: '500', color: AP.mutedForeground },
  currencyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: soft.muted50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, borderWidth: 1, borderColor: AP.border },
  currencyText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: AP.mutedForeground },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 },
  balanceAmount: { fontSize: 46, fontWeight: '800', letterSpacing: -1, color: AP.foreground, fontVariant: ['tabular-nums'] },
  balanceCents: { fontSize: 18, fontWeight: '500', color: AP.mutedForeground, marginBottom: 8 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 24 },
  action: { width: '47%', flexGrow: 1, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 16, minHeight: 96, justifyContent: 'space-between', alignItems: 'flex-start' },
  actionIcon: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600', color: AP.foreground },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: AP.foreground },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAllText: { fontSize: 14, fontWeight: '500', color: AP.primary },

  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 16 },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  txIcon: { width: 48, height: 48, borderRadius: radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14, fontWeight: '600', color: AP.foreground },
  txSub: { fontSize: 12, color: AP.mutedForeground },
  txAmount: { fontSize: 14, fontWeight: '600', color: AP.foreground, fontVariant: ['tabular-nums'] },
  txStatus: { fontSize: 10, fontWeight: '500', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, overflow: 'hidden' },
});
