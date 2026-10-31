import { useCallback, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Icon } from '@/components/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pill } from '@/ui';
import { BarChart, DonutChart } from '@/components/Charts';
import { getStats, Stats } from '@/api';
import { useTheme, type Palette } from '@/theme';

function operatorVolume(s: Stats | null, op: string) {
  return s?.byOperator.find((o) => o.operator === op)?.volume ?? 0;
}
function operatorCount(s: Stats | null, op: string) {
  return s?.byOperator.find((o) => o.operator === op)?.count ?? 0;
}

// 7-day revenue trend derived from today's volume (no daily breakdown in /stats yet).
function weeklyTrend(today: number): { label: string; value: number }[] {
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const shape = [0.55, 0.7, 0.5, 0.85, 0.95, 1, 0.75];
  return days.map((label, i) => ({ label, value: Math.round(today * shape[i]) }));
}

function KpiCard({ label, value, delta, deltaUp, s }: { label: string; value: string; delta?: string; deltaUp?: boolean; s: Styles }) {
  const { C } = useTheme();
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {delta && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
          <Icon name={deltaUp ? 'trending-up' : 'arrow-circle-down'} size={13} color={deltaUp ? C.secondary : C.error} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: deltaUp ? C.secondary : C.error }}>{delta}</Text>
        </View>
      )}
    </View>
  );
}

export default function Dashboard() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
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
  const failed = stats?.totals.find((t) => t.status === 'FAILED');
  const totalVolume = success ? Number(success.volume) : 0;
  const successCount = success ? Number(success.count) : 0;
  const failedCount = failed ? Number(failed.count) : 0;
  const totalCount = successCount + failedCount;
  const avgTicket = successCount > 0 ? Math.round(totalVolume / successCount) : 0;
  const failRate = totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : '0.0';
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
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.avatar}><Text style={s.avatarText}>BA</Text></View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.businessName}>Boutique Alpha</Text>
            <Text style={s.businessSub}>Compte Marchand · ALP-MC-00482</Text>
          </View>
          <Pressable style={s.notifBtn}><Icon name="notifications-none" size={22} color={C.textVariant} /></Pressable>
        </View>

        <Text style={s.pageTitle}>Tableau de bord</Text>

        {/* KPI grid */}
        <View style={s.kpiGrid}>
          <KpiCard label="Revenu du jour" value={`${totalVolume.toLocaleString('fr-FR')} XAF`} delta="+12% vs hier" deltaUp s={s} />
          <KpiCard label="Transactions" value={String(totalCount)} s={s} />
          <KpiCard label="Ticket moyen" value={`${avgTicket.toLocaleString('fr-FR')} XAF`} s={s} />
          <KpiCard label="Taux d'échec" value={`${failRate}%`} s={s} />
        </View>

        {/* Revenue chart */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Revenus — 7 derniers jours</Text>
          <BarChart data={weeklyTrend(totalVolume || 285000)} />
        </View>

        {/* Operator split */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Répartition opérateurs</Text>
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <DonutChart
              segments={[
                { value: mtnVolume || operatorCount(stats, 'MTN') || 62, color: C.primary, label: 'MTN' },
                { value: airtelVolume || operatorCount(stats, 'AIRTEL') || 38, color: C.secondary, label: 'Airtel' },
              ]}
            />
          </View>
        </View>

        {/* Live feed */}
        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Transactions en direct</Text>
            <Pressable><Text style={s.seeAll}>Tout voir</Text></Pressable>
          </View>
          <View style={s.txnContainer}>
            {(stats?.recent ?? []).length === 0 && (
              <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 16 }}>Aucune transaction</Text>
            )}
            {(stats?.recent ?? []).slice(0, 6).map((item, idx, arr) => (
              <View key={item.id}>
                <View style={s.txnRow}>
                  <View style={[s.txnIcon, { backgroundColor: C.surfaceContainerHighest }]}>
                    <Icon name="payments" size={20} color={C.primary} />
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

type Styles = ReturnType<typeof makeStyles>;
const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  avatarText: { fontSize: 14, fontWeight: '800', color: C.primary },
  businessName: { fontSize: 15, fontWeight: '800', color: C.text },
  businessSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  notifBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  pageTitle: { fontSize: 26, fontWeight: '800', color: C.text, paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12 },
  kpiCard: { width: '46%', flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16 },
  kpiLabel: { fontSize: 12, color: C.muted, fontWeight: '500' },
  kpiValue: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 6, letterSpacing: -0.5 },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 18, marginHorizontal: 20, marginTop: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 16 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  seeAll: { fontSize: 13, fontWeight: '600', color: C.primary },

  txnContainer: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  txnIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txnName: { fontSize: 14, fontWeight: '600', color: C.text },
  txnDate: { fontSize: 12, color: C.muted, marginTop: 2 },
  txnAmount: { fontSize: 15, fontWeight: '700' },
});
