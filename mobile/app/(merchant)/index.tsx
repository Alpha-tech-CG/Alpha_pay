import { useEffect, useRef } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { Amount, EmptyLine, ErrorLine, Hero, Initials, SectionHead, Spinner, Surface, useAmountsHidden, useStatusBar } from '@/bank';
import { FadeIn, PressScale, reduceMotion, useCountUp } from '@/motion';
import { PaymentRow } from '@/PaymentRow';
import { errorCode, getPayments, getStats, getSummary, type Stats, type Summary } from '@/api';
import { OPERATOR_LABEL } from '@/format';
import { useMerchant, useSession } from '@/session';
import { useLoad } from '@/useLoad';

type Overview = { stats: Stats | null; summary: Summary | null };

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

function QuickAction({ icon, label, onPress, primary, index }: { icon: string; label: string; onPress: () => void; primary?: boolean; index: number }) {
  return (
    <FadeIn index={index} delay={150} style={{ flex: 1 }}>
      <PressScale onPress={onPress} style={s.qa} accessibilityRole="button" accessibilityLabel={label}>
        <View style={[s.qaIcon, primary && { backgroundColor: B.mustard }]}>
          <Icon name={icon} size={22} color={primary ? B.navy : B.white} />
        </View>
        <Text style={s.qaLabel} numberOfLines={1}>{label}</Text>
      </PressScale>
    </FadeIn>
  );
}

/** Barre de répartition qui se remplit à l'apparition. */
function Bar({ ratio, color }: { ratio: number; color: string }) {
  const v = useRef(new Animated.Value(reduceMotion() ? ratio : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: ratio, duration: 700, delay: 250, useNativeDriver: false }).start();
  }, [ratio, v]);
  return (
    <View style={s.track}>
      <Animated.View style={[s.fill, { backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  useStatusBar('light');
  const [hidden, toggleHidden] = useAmountsHidden();
  const { user } = useSession();
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

  const st = overview.data?.stats;
  const sum = overview.data?.summary;
  const todayValue = st?.day.succeeded_volume ?? sum?.today.amount ?? 0;
  const todayCount = st?.day.succeeded_count ?? sum?.today.count ?? 0;
  const animated = useCountUp(todayValue);
  const firstName = (user?.fullName ?? '').split(' ')[0];
  const opTotal = st?.by_operator.reduce((a, o) => a + o.volume, 0) || 1;

  const reload = () => {
    overview.reload();
    recent.reload();
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={overview.refreshing || recent.refreshing} onRefresh={reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero
          title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
          subtitle={membership?.name && membership.name !== user?.fullName ? membership.name : undefined}
          right={
            <>
              <PressScale onPress={toggleHidden} hitSlop={8} style={s.eye} accessibilityRole="button" accessibilityLabel={hidden ? 'Afficher les montants' : 'Masquer les montants'}>
                <Icon name={hidden ? 'eye-off' : 'eye'} size={18} color={B.white} />
              </PressScale>
              <Initials name={membership?.name ?? 'AlphaPay'} light onPress={() => router.push('/(merchant)/settings')} />
            </>
          }
        >
          <FadeIn>
            <View style={s.modeRow}>
              <View style={[s.mode, { backgroundColor: mode === 'live' ? 'rgba(46,125,91,0.25)' : 'rgba(212,160,23,0.22)' }]}>
                <View style={[s.modeDot, { backgroundColor: mode === 'live' ? '#5FD39B' : B.mustard }]} />
                <Text style={s.modeText}>{mode === 'live' ? 'Live' : 'Mode test'}</Text>
              </View>
            </View>
            <Text style={s.heroLabel}>{manager ? "Encaissé aujourd'hui" : 'Vos encaissements'}</Text>
            {manager ? <Amount value={animated} size={40} color={B.white} /> : <Text style={s.heroBig}>Caisse</Text>}
            {manager ? <Text style={s.heroSub}>{todayCount} paiement{todayCount > 1 ? 's' : ''} réussi{todayCount > 1 ? 's' : ''}</Text> : null}
          </FadeIn>
          <View style={s.qaRow}>
            <QuickAction index={0} icon="qr-code" label="Encaisser" primary onPress={() => router.push('/(merchant)/collect')} />
            {manager && <QuickAction index={1} icon="link" label="Lien" onPress={() => router.push('/(merchant)/links')} />}
            <QuickAction index={2} icon="credit-card" label="Cartes" onPress={() => router.push('/(merchant)/card')} />
            <QuickAction index={3} icon="swap-horiz" label="Paiements" onPress={() => router.push('/(merchant)/payments')} />
          </View>
        </Hero>

        <View style={s.body}>
          {!canLive && (
            <FadeIn index={1}>
              <View style={s.notice}>
                <Icon name="info" size={18} color={B.burgundy} />
                <Text style={s.noticeText}>Mode test : aucun argent réel. Le live s’ouvre dès que votre dossier est validé.</Text>
              </View>
            </FadeIn>
          )}

          {st && (
            <View style={s.kpis}>
              {[
                { label: '7 derniers jours', value: st.week.succeeded_volume, count: st.week.succeeded_count },
                { label: 'Ce mois-ci', value: st.month.succeeded_volume, count: st.month.succeeded_count },
              ].map((k, i) => (
                <Surface key={k.label} index={i + 1} style={s.kpi}>
                  <Text style={s.kpiLabel}>{k.label}</Text>
                  <Amount value={k.value} size={22} />
                  <Text style={s.kpiSub}>{k.count} paiement(s)</Text>
                </Surface>
              ))}
            </View>
          )}
          {sum && (
            <Surface index={1} style={s.kpi}>
              <Text style={s.kpiLabel}>Depuis le début</Text>
              <Amount value={sum.all_time.amount} size={22} />
              <Text style={s.kpiSub}>{sum.all_time.count} paiement(s)</Text>
            </Surface>
          )}

          {st && st.by_operator.length > 0 && (
            <Surface index={3}>
              <SectionHead title="Moyens de paiement" />
              {st.by_operator.map((o) => (
                <View key={o.operator} style={{ marginTop: 10 }}>
                  <View style={s.opRow}>
                    <Text style={s.opName}>{OPERATOR_LABEL[o.operator] ?? o.operator}</Text>
                    <Text style={s.opValue}>{hidden ? '••••' : o.volume_display}</Text>
                  </View>
                  <Bar ratio={o.volume / opTotal} color={o.operator === 'airtel' ? B.burgundy : o.operator === 'card' ? B.navy : B.mustard} />
                </View>
              ))}
            </Surface>
          )}

          <Surface index={4}>
            <SectionHead title="Derniers paiements" onPress={() => router.push('/(merchant)/payments')} />
            <ErrorLine message={overview.error ?? recent.error} />
            {recent.loading && !recent.data ? <Spinner /> : null}
            {recent.data?.data.length === 0 && <EmptyLine title="Aucun paiement" body="Vos encaissements apparaîtront ici, en direct." />}
            {recent.data?.data.map((p, i, a) => <PaymentRow key={p.id} p={p} index={i} last={i === a.length - 1} />)}
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  eye: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', marginBottom: 14 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  modeDot: { width: 7, height: 7, borderRadius: 4 },
  modeText: { fontFamily: F.semibold, fontSize: 12, color: B.white },
  heroLabel: { fontFamily: F.medium, fontSize: 14, color: B.onNavyMuted, marginBottom: 4 },
  heroBig: { fontFamily: F.bold, fontSize: 34, color: B.white },
  heroSub: { fontFamily: F.regular, fontSize: 14, color: B.onNavyMuted, marginTop: 2 },
  qaRow: { flexDirection: 'row', gap: 8, marginTop: 24 },
  qa: { alignItems: 'center', gap: 8, minHeight: 72 },
  qaIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontFamily: F.medium, fontSize: 12, color: B.white },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: B.burgundySoft, borderRadius: R.md, padding: 14 },
  noticeText: { flex: 1, fontFamily: F.medium, fontSize: 13, color: B.burgundyDeep, lineHeight: 19 },
  kpis: { flexDirection: 'row', gap: 12 },
  kpi: { flex: 1, gap: 4 },
  kpiLabel: { fontFamily: F.medium, fontSize: 13, color: B.muted },
  kpiSub: { fontFamily: F.regular, fontSize: 12, color: B.muted },
  opRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  opName: { fontFamily: F.medium, fontSize: 14, color: B.ink },
  opValue: { fontFamily: F.semibold, fontSize: 14, color: B.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: B.lineSoft, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
