import { useMemo } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet, type Transaction } from '@/wallet-store';

const STACK = [
  'https://randomuser.me/api/portraits/men/32.jpg',
  'https://randomuser.me/api/portraits/women/44.jpg',
  'https://randomuser.me/api/portraits/men/12.jpg',
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

const TINT: Record<Transaction['tint'], { fg: string; bg: string }> = {
  primary: { fg: AP.primary, bg: soft.primary10 },
  secondary: { fg: AP.secondary, bg: soft.secondary10 },
  mtn: { fg: AP.mtn, bg: soft.mtn10 },
  success: { fg: AP.chart3, bg: soft.chart3_10 },
  failed: { fg: AP.chart4, bg: soft.chart4_10 },
  chart5: { fg: AP.chart5, bg: soft.chart5_10 },
};

function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <View style={s.quickCol}>
      <Pressable style={({ pressed }) => [s.quickBtn, pressed && s.pressed]} onPress={onPress}>
        <Icon name={icon} size={24} color={color} />
      </Pressable>
      <Text style={s.quickLabel}>{label}</Text>
    </View>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const t = TINT[tx.tint];
  const positive = tx.direction === 'in';
  const failed = tx.status === 'failed';
  return (
    <View style={[s.txRow, failed && { opacity: 0.7 }]}>
      <View style={s.txLeft}>
        <View style={[s.txIcon, { backgroundColor: t.bg }]}>
          <Icon name={tx.icon} size={22} color={t.fg} />
        </View>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={s.txTitle}>{tx.title}</Text>
          <Text style={s.txSub}>{tx.subtitle}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={s.txAmount}>{positive ? '+' : '-'}{formatXAF(Math.abs(tx.amountCents))}</Text>
        <View style={[s.txBadge, { backgroundColor: failed ? soft.chart4_10 : soft.chart3_10 }]}>
          <Text style={[s.txBadgeText, { color: failed ? AP.chart4 : AP.chart3 }]}>{failed ? 'Failed' : 'Success'}</Text>
        </View>
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
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View>
              <Image source={{ uri: user.avatar }} style={s.avatar} />
              <View style={s.onlineDot} />
            </View>
            <View>
              <Text style={s.greeting}>{greeting()}</Text>
              <Text style={s.name}>{user.name}</Text>
            </View>
          </View>
          <Pressable style={s.bell}>
            <Icon name="bell" size={22} color={AP.secondary} />
            <View style={s.bellDot} />
          </Pressable>
        </View>

        {/* Balance card (navy) */}
        <View style={s.balanceCard}>
          <View style={s.glowTop} />
          <View style={s.balanceHead}>
            <View style={s.walletChip}>
              <Text style={s.walletChipText}>{currency === 'XAF' ? 'CONGO WALLET' : currency}</Text>
              <Icon name="chevron-down" size={12} color="rgba(255,255,255,0.9)" />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={s.balanceLabel}>Total Balance</Text>
            <View style={s.balanceRow}>
              <Text style={s.balanceAmount}>{formatXAF(balanceCents)}</Text>
              <Text style={s.balanceCurrency}>{currency}</Text>
            </View>
          </View>
          <View style={s.balanceFoot}>
            <View style={s.avatarStack}>
              {STACK.map((uri, i) => (
                <Image key={uri} source={{ uri }} style={[s.stackAvatar, { marginLeft: i === 0 ? 0 : -12 }]} />
              ))}
              <View style={[s.stackAvatar, s.stackMore, { marginLeft: -12 }]}>
                <Text style={s.stackMoreText}>+12</Text>
              </View>
            </View>
            <Pressable style={({ pressed }) => [s.topupBtn, pressed && s.pressed]} onPress={() => router.push('/(client)/top-up')}>
              <Icon name="add-circle" size={18} color={AP.secondary} />
              <Text style={s.topupText}>Top-up</Text>
            </Pressable>
          </View>
        </View>

        {/* Quick actions */}
        <View style={s.quickGrid}>
          <QuickAction icon="send" label="Send" color={AP.primary} onPress={() => router.push('/(client)/send')} />
          <QuickAction icon="qr-code" label="Receive" color={AP.secondary} onPress={() => router.push('/(client)/receive')} />
          <QuickAction icon="store" label="Pay" color={AP.chart5} onPress={() => router.push('/(client)/scan')} />
          <QuickAction icon="receipt-long" label="Bills" color={AP.chart3} onPress={() => router.push('/(client)/top-up')} />
        </View>

        {/* Recent activities */}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Recent Activities</Text>
          <Pressable style={s.viewAll} onPress={() => router.push('/(client)/(tabs)/history')}>
            <Text style={s.viewAllText}>VIEW ALL</Text>
            <Icon name="chevron-right" size={14} color={AP.primary} />
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
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 128 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: radius.xxl, borderWidth: 2, borderColor: '#fff', ...shadow(4) },
  onlineDot: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: AP.chart3, borderWidth: 2, borderColor: AP.bg },
  greeting: { fontSize: 10, color: AP.mutedForeground, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  name: { fontSize: 18, fontWeight: '700', color: AP.secondary },
  bell: { width: 48, height: 48, borderRadius: radius.xxl, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  bellDot: { position: 'absolute', top: 13, right: 13, width: 10, height: 10, borderRadius: 5, backgroundColor: AP.chart4, borderWidth: 2, borderColor: '#fff' },

  balanceCard: { backgroundColor: AP.secondary, borderRadius: 40, padding: 32, gap: 24, overflow: 'hidden', ...shadow(20, AP.secondary, 0.2) },
  glowTop: { position: 'absolute', top: -64, right: -64, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,180,216,0.18)' },
  balanceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  walletChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' },
  balanceLabel: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  balanceAmount: { fontSize: 40, fontWeight: '800', letterSpacing: -1.5, color: '#fff', fontVariant: ['tabular-nums'] },
  balanceCurrency: { fontSize: 20, fontWeight: '500', color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
  balanceFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: AP.secondary },
  stackMore: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  stackMoreText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  topupBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: AP.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.full },
  topupText: { fontSize: 12, fontWeight: '700', color: AP.secondary },

  quickGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 24 },
  quickCol: { alignItems: 'center', gap: 8, flex: 1 },
  quickBtn: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  quickLabel: { fontSize: 11, fontWeight: '700', color: AP.secondary },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, marginTop: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: AP.secondary },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: AP.primary },

  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxxl, padding: 16, ...shadow(2) },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  txIcon: { width: 48, height: 48, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14, fontWeight: '700', color: AP.secondary },
  txSub: { fontSize: 11, color: AP.mutedForeground },
  txAmount: { fontSize: 14, fontWeight: '700', color: AP.secondary, fontVariant: ['tabular-nums'] },
  txBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  txBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
});
