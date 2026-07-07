import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pill } from '@/ui';
import { getStats, Stats } from '@/api';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function operatorVolume(s: Stats | null, op: string) {
  return s?.byOperator.find((o) => o.operator === op)?.volume ?? 0;
}

function QuickAction({ icon, label, primary }: { icon: IconName; label: string; primary?: boolean }) {
  return (
    <Pressable style={{ alignItems: 'center', gap: 8 }}>
      <View style={[s.qaBox, primary ? s.qaBoxPrimary : s.qaBoxSecondary]}>
        <MaterialIcons name={icon} size={24} color={primary ? '#fff' : C.primary} />
      </View>
      <Text style={s.qaLabel}>{label}</Text>
    </Pressable>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setStats(await getStats()); }
    catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const success = stats?.totals.find((t) => t.status === 'SUCCESSFUL');
  const totalVolume = success ? Number(success.volume) : 0;
  const mtnVolume = operatorVolume(stats, 'MTN');
  const airtelVolume = operatorVolume(stats, 'AIRTEL');

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
        <ActivityIndicator color={C.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>JK</Text>
          </View>
          <Text style={s.logoText}>PayBrain</Text>
          <Pressable style={s.notifBtn}>
            <MaterialIcons name="notifications-none" size={24} color={C.textVariant} />
          </Pressable>
        </View>

        {/* ── Balance ── */}
        <View style={s.balanceSection}>
          <Text style={s.balanceLabel}>Volume total encaissé</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={s.balanceAmount}>{totalVolume.toLocaleString('fr-FR')}</Text>
            <Text style={s.balanceCurrency}>,00 XAF</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <MaterialIcons name="trending-up" size={16} color={C.secondary} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.secondary }}>+2.4% depuis le mois dernier</Text>
          </View>
        </View>

        {/* ── Quick actions ── */}
        <View style={s.qaRow}>
          <QuickAction icon="send" label="Envoyer" primary />
          <QuickAction icon="download" label="Recevoir" />
          <QuickAction icon="qr-code-scanner" label="Scanner" />
          <QuickAction icon="add-card" label="Recharger" />
        </View>

        {/* ── Account cards ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Mes comptes</Text>
            <Pressable><Text style={s.seeAll}>Voir tout</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {/* MTN card */}
            <View style={[s.accountCard, { backgroundColor: C.primary }]}>
              <View style={s.cardGlow} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 }}>
                <Text style={s.cardLabel}>MTN Mobile Money</Text>
                <MaterialIcons name="contactless" size={22} color="rgba(255,255,255,0.8)" />
              </View>
              <View style={{ zIndex: 1 }}>
                <Text style={s.cardNumber}>+242 065 *** ***</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <Text style={s.cardBalanceLabel}>SOLDE</Text>
                    <Text style={s.cardBalance}>{mtnVolume.toLocaleString('fr-FR')} XAF</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Airtel card */}
            <View style={[s.accountCard, { backgroundColor: C.secondary }]}>
              <View style={s.cardGlow} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 }}>
                <Text style={s.cardLabel}>Airtel Money</Text>
                <MaterialIcons name="contactless" size={22} color="rgba(255,255,255,0.8)" />
              </View>
              <View style={{ zIndex: 1 }}>
                <Text style={s.cardNumber}>+242 074 *** ***</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <Text style={s.cardBalanceLabel}>SOLDE</Text>
                    <Text style={s.cardBalance}>{airtelVolume.toLocaleString('fr-FR')} XAF</Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* ── Recent transactions ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Transactions récentes</Text>
            <Pressable><Text style={s.seeAll}>Voir tout</Text></Pressable>
          </View>
          <View style={s.txnContainer}>
            {(stats?.recent ?? []).length === 0 && (
              <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 16 }}>Aucune transaction</Text>
            )}
            {(stats?.recent ?? []).slice(0, 5).map((item, idx, arr) => (
              <View key={item.id}>
                <View style={s.txnRow}>
                  <View style={[s.txnIcon, { backgroundColor: C.surfaceContainerHighest }]}>
                    <MaterialIcons name="payments" size={20} color={C.primary} />
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={s.txnName} numberOfLines={1}>{item.payerPhone}</Text>
                    <Text style={s.txnDate}>{new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[s.txnAmount, { color: item.status === 'SUCCESSFUL' ? C.secondary : C.text }]}>
                      {item.status === 'SUCCESSFUL' ? '+' : ''}{Number(item.amount).toLocaleString('fr-FR')} XAF
                    </Text>
                    <Pill status={item.status} />
                  </View>
                </View>
                {idx < arr.length - 1 && <View style={{ height: 1, backgroundColor: C.border, marginLeft: 60 }} />}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 56 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  avatarText: { fontSize: 11, fontWeight: '700', color: C.primary },
  logoText: { flex: 1, fontSize: 20, fontWeight: '700', color: C.primary, marginLeft: 10 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  balanceSection: { paddingHorizontal: 20, paddingBottom: 20 },
  balanceLabel: { fontSize: 14, fontWeight: '500', color: C.muted, marginBottom: 4 },
  balanceAmount: { fontSize: 44, fontWeight: '700', color: C.text, letterSpacing: -1 },
  balanceCurrency: { fontSize: 20, fontWeight: '600', color: C.muted },

  qaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 28 },
  qaBox: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  qaBoxPrimary: { backgroundColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  qaBoxSecondary: { backgroundColor: C.surfaceContainerHighest },
  qaLabel: { fontSize: 11, fontWeight: '600', color: C.muted, textAlign: 'center' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.text },
  seeAll: { fontSize: 13, fontWeight: '600', color: C.primary },

  accountCard: { width: 280, height: 170, borderRadius: 16, padding: 20, justifyContent: 'space-between', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6 },
  cardGlow: { position: 'absolute', top: -32, right: -32, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.1)' },
  cardLabel: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
  cardNumber: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.9)', letterSpacing: 2, marginBottom: 10 },
  cardBalanceLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  cardBalance: { fontSize: 20, fontWeight: '700', color: '#fff' },

  txnContainer: { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden', shadowColor: '#0035c5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  txnIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txnName: { fontSize: 14, fontWeight: '600', color: C.text },
  txnDate: { fontSize: 12, color: C.muted, marginTop: 2 },
  txnAmount: { fontSize: 15, fontWeight: '700' },
});
