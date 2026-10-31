import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AP, radius, soft } from '@/design';
import { ucFont } from '@/uc';
import { Card, SectionTitle, StatCard } from '@/dash';
import { Button, Empty, ErrorBox, Header, Loading, ModeBadge } from '@/kit';
import { PaymentRow } from '@/PaymentRow';
import { errorCode, getPayments, getStats, getSummary, type Stats, type Summary } from '@/api';
import { money, OPERATOR_LABEL } from '@/format';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

type Overview = { stats: Stats | null; summary: Summary | null };

export default function Home() {
  const router = useRouter();
  const { membership, merchantId, mode, canLive, can } = useMerchant();
  const manager = can('payments:view');

  // Statistiques détaillées (module Gérer) ; sinon les totaux simples du jour.
  const overview = useLoad<Overview | null>(async () => {
    if (!manager) return null;
    try {
      return { stats: await getStats(merchantId, mode), summary: null };
    } catch (e) {
      if (errorCode(e) !== 'module_non_inclus') throw e;
      return { stats: null, summary: await getSummary(merchantId, mode) };
    }
  }, [merchantId, mode, manager], { pollMs: 30000 });

  const recent = useLoad(() => getPayments(merchantId, mode, { limit: 6 }), [merchantId, mode], { pollMs: 15000 });

  const reload = () => {
    overview.reload();
    recent.reload();
  };

  const stats = overview.data?.stats;
  const summary = overview.data?.summary;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={overview.refreshing || recent.refreshing} onRefresh={reload} />}>
        <Header title={membership?.name ?? 'AlphaPay'} right={<ModeBadge mode={mode} />} />

        {!canLive && (
          <View style={s.banner}>
            <Text style={s.bannerTitle}>Mode test</Text>
            <Text style={s.bannerText}>Aucun argent réel ne circule. Le live s'ouvre quand votre dossier est validé (tableau de bord web, rubrique Dossier).</Text>
          </View>
        )}

        <Button label="Encaisser un paiement" onPress={() => router.push('/(merchant)/collect')} style={{ marginBottom: 16 }} />

        {manager && (
          <>
            <ErrorBox message={overview.error} />
            {overview.loading && !overview.data ? <Loading /> : null}
            {stats && (
              <>
                <View style={s.grid}>
                  <StatCard label="Aujourd'hui" value={money(stats.day.succeeded_volume, '')} unit="XAF" hint={`${stats.day.succeeded_count} paiement(s) réussi(s)`} trend="up" />
                  <StatCard label="Échecs du jour" value={String(stats.day.failed_count)} hint={`${stats.day.total_count} tentative(s)`} trend="flat" />
                  <StatCard label="7 derniers jours" value={money(stats.week.succeeded_volume, '')} unit="XAF" hint={`${stats.week.succeeded_count} réussi(s)`} trend="up" />
                  <StatCard label="Ce mois" value={money(stats.month.succeeded_volume, '')} unit="XAF" hint={`${stats.month.succeeded_count} réussi(s)`} trend="up" />
                </View>
                {stats.by_operator.length > 0 && (
                  <Card style={{ marginTop: 16 }}>
                    <SectionTitle>Par moyen de paiement (mois)</SectionTitle>
                    {stats.by_operator.map((o) => {
                      const total = stats.by_operator.reduce((a, x) => a + x.volume, 0) || 1;
                      return (
                        <View key={o.operator} style={{ marginBottom: 12 }}>
                          <View style={s.opRow}>
                            <Text style={s.opName}>{OPERATOR_LABEL[o.operator] ?? o.operator}</Text>
                            <Text style={s.opValue}>{o.volume_display} · {o.count}</Text>
                          </View>
                          <View style={s.track}><View style={[s.fill, { width: `${Math.round((o.volume / total) * 100)}%`, backgroundColor: o.operator === 'airtel' ? AP.airtel : o.operator === 'card' ? AP.primary : AP.mtn }]} /></View>
                        </View>
                      );
                    })}
                  </Card>
                )}
              </>
            )}
            {summary && (
              <View style={s.grid}>
                <StatCard label="Aujourd'hui" value={money(summary.today.amount, '')} unit="XAF" hint={`${summary.today.count} paiement(s)`} trend="up" />
                <StatCard label="Depuis le début" value={money(summary.all_time.amount, '')} unit="XAF" hint={`${summary.all_time.count} paiement(s)`} trend="up" />
              </View>
            )}
          </>
        )}

        <Card style={{ marginTop: 16 }}>
          <SectionTitle action="Tout voir" onAction={() => router.push('/(merchant)/payments')}>Derniers paiements</SectionTitle>
          <ErrorBox message={recent.error} />
          {recent.loading && !recent.data ? <Loading /> : null}
          {recent.data?.data.length === 0 && <Empty title="Aucun paiement" body={mode === 'test' ? 'Encaissez un paiement de test depuis l’onglet Encaisser.' : 'Vos paiements apparaîtront ici.'} />}
          {recent.data?.data.map((p) => <PaymentRow key={p.id} p={p} />)}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  banner: { backgroundColor: soft.chart5_10, borderRadius: radius.lg, padding: 14, marginBottom: 16, gap: 4 },
  bannerTitle: { fontFamily: ucFont.condensed, fontWeight: '700', color: AP.chart5, fontSize: 15 },
  bannerText: { color: AP.foreground, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  opRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  opName: { fontSize: 14, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  opValue: { fontSize: 13, color: AP.mutedForeground },
  track: { height: 8, borderRadius: 4, backgroundColor: soft.muted50, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
