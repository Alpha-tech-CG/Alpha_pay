import { useCallback, useState, useMemo } from 'react';
import {
  View, Text, FlatList, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Icon } from '@/components/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSettlements, Settlement } from '@/api';
import { useTheme, type Palette } from '@/theme';

type IconName = string;

const statusMapFactory = (C: Palette): Record<string, { label: string; color: string; bg: string; icon: IconName }> => ({
  CONFIRMED:          { label: 'Confirmé',        color: C.secondary, bg: C.successBg,              icon: 'check-circle' },
  SENT:               { label: 'Envoyé',           color: C.primary,   bg: C.surfaceContainerHigh,   icon: 'send' },
  INITIATED:          { label: 'Initié',           color: C.muted,     bg: C.surfaceContainerHighest, icon: 'schedule' },
  PENDING_VALIDATION: { label: 'En validation',    color: C.pending,   bg: C.pendingBg,              icon: 'hourglass-empty' },
  FAILED:             { label: 'Échoué',           color: C.error,     bg: C.errorContainer,         icon: 'cancel' },
});

function money(cents: number) {
  return (Number(cents) / 100).toLocaleString('fr-FR');
}

export default function Settlements() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const STATUS_MAP = statusMapFactory(C);
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await getSettlements()); }
    catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
        <ActivityIndicator color={C.primary} size="large" />
      </SafeAreaView>
    );
  }

  const confirmed = rows.filter((r) => r.status === 'CONFIRMED');
  const totalConfirmed = confirmed.reduce((acc, r) => acc + (r.settledNetCents ?? r.netCents), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Reversements</Text>
        <Text style={s.pageSubtitle}>Vos reversements vers Mobile Money</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
        ListHeaderComponent={
          rows.length > 0 ? (
            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <View>
                  <Text style={s.summaryLabel}>Total reversé</Text>
                  <Text style={s.summaryAmount}>{money(totalConfirmed)} XAF</Text>
                </View>
                <View style={s.summaryBadge}>
                  <Icon name="account-balance" size={20} color={C.primary} />
                </View>
              </View>
              <View style={s.summaryMeta}>
                <Text style={s.summaryMetaText}>{confirmed.length} reversement{confirmed.length > 1 ? 's' : ''} confirmé{confirmed.length > 1 ? 's' : ''}</Text>
                <Text style={s.summaryMetaText}>Prochain : chaque vendredi</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Icon name="account-balance" size={28} color={C.muted} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 6 }}>Aucun reversement</Text>
            <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>Vos reversements apparaîtront ici une fois les transactions confirmées.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st = STATUS_MAP[item.status] ?? { label: item.status, color: C.muted, bg: C.surfaceContainerHighest, icon: 'info' as IconName };
          const amount = item.settledNetCents != null ? money(item.settledNetCents) : money(item.netCents);
          const currency = item.settledNetCents != null ? (item.settlementCurrency ?? item.currency) : item.currency;
          return (
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.cardIcon, { backgroundColor: st.bg }]}>
                  <Icon name={st.icon} size={22} color={st.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.batchNum}>{item.batchNumber}</Text>
                  <Text style={s.batchDate}>{new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={s.cardAmount}>{amount} {currency}</Text>
                  <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
              </View>
              {item.settledNetCents != null && (
                <View style={s.conversionRow}>
                  <Icon name="swap-horiz" size={14} color={C.muted} />
                  <Text style={s.conversionText}>Encaissé : {money(item.netCents)} {item.currency} → converti en {currency}</Text>
                </View>
              )}
              {/* Progress bar */}
              <View style={s.progressBg}>
                <View style={[s.progressFill, {
                  width: item.status === 'CONFIRMED' ? '100%' : item.status === 'SENT' ? '75%' : item.status === 'PENDING_VALIDATION' ? '40%' : item.status === 'INITIATED' ? '15%' : '0%',
                  backgroundColor: st.color,
                }]} />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  topBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: C.muted, marginTop: 2 },

  summaryCard: { backgroundColor: C.primary, borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  summaryAmount: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  summaryBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  summaryMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#0035c5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  batchNum: { fontSize: 14, fontWeight: '600', color: C.text },
  batchDate: { fontSize: 12, color: C.muted, marginTop: 2 },
  cardAmount: { fontSize: 16, fontWeight: '700', color: C.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  conversionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  conversionText: { fontSize: 12, color: C.muted },
  progressBg: { height: 4, backgroundColor: C.surfaceContainerHigh, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
