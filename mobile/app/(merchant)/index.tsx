import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AP, soft, radius, shadow } from '@/design';
import { Card, SectionTitle, StatCard } from '@/dash';
import { revenueBars, merchant } from '@/merchant-data';
import { useMerchant } from '@/merchant-store';

const CHART_H = 150;

export default function MerchantDashboard() {
  const router = useRouter();
  const { kpis, realtime } = useMerchant();
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={{ gap: 6 }}>
            <Text style={s.title}>Dashboard</Text>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>Live Environment</Text>
            </View>
          </View>
          <View style={s.avatar}><Text style={s.avatarText}>{merchant.initials}</Text></View>
        </View>

        <Pressable style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]} onPress={() => router.push('/(merchant)/payment-links')}>
          <Text style={s.ctaText}>Generate Payment Link</Text>
        </Pressable>

        {/* KPI cards */}
        <View style={s.grid}>
          {kpis.map((k) => (
            <StatCard key={k.key} label={k.label} value={k.value} unit={k.unit} delta={k.delta} hint={k.hint} trend={k.trend} />
          ))}
        </View>

        {/* Revenue distribution */}
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Revenue Distribution</SectionTitle>
          <View style={s.legend}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: AP.primary }]} /><Text style={s.legendText}>MTN MoMo</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: AP.airtel }]} /><Text style={s.legendText}>Airtel Money</Text></View>
          </View>
          <View style={s.chart}>
            {revenueBars.map((b) => (
              <View key={b.day} style={s.barCol}>
                <View style={s.barTrack}>
                  <View style={{ height: (CHART_H * b.mtn) / 100, backgroundColor: AP.primary, borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
                  <View style={{ height: (CHART_H * b.airtel) / 100, backgroundColor: AP.airtel, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, marginTop: 3 }} />
                </View>
                <Text style={s.barLabel}>{b.day}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Real-time */}
        <Card style={{ marginTop: 16 }}>
          <SectionTitle action="Full History">Real-time</SectionTitle>
          <View style={{ gap: 20 }}>
            {realtime.map((r) => (
              <View key={r.id} style={s.rtRow}>
                <View style={s.rtLeft}>
                  <View style={[s.netTile, r.net === 'airtel' && { backgroundColor: soft.chart4_10, borderColor: soft.chart4_20 }]}>
                    <Text style={[s.netText, { color: r.net === 'airtel' ? AP.airtel : AP.mutedForeground }]}>{r.net === 'airtel' ? 'ART' : 'MTN'}</Text>
                  </View>
                  <View>
                    <Text style={s.rtName}>{r.name}</Text>
                    <Text style={s.rtAgo}>{r.ago}</Text>
                  </View>
                </View>
                <Text style={s.rtAmount}>{r.amount}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 },
  title: { fontSize: 24, fontWeight: '900', color: AP.secondary },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: soft.chart3_10, borderRadius: radius.full, borderWidth: 1, borderColor: soft.chart3_10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: AP.chart3 },
  liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: AP.chart3, textTransform: 'uppercase' },
  avatar: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: AP.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900', color: AP.secondary },

  cta: { height: 52, backgroundColor: AP.secondary, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: 20, ...shadow(10, AP.secondary, 0.2) },
  ctaText: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: '#fff', textTransform: 'uppercase' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  legend: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: AP.mutedForeground, textTransform: 'uppercase' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, height: CHART_H + 24 },
  barCol: { flex: 1, alignItems: 'center', gap: 8 },
  barTrack: { width: '100%', height: CHART_H, justifyContent: 'flex-end' },
  barLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase' },

  rtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rtLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  netTile: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: soft.muted50, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  netText: { fontSize: 10, fontWeight: '900' },
  rtName: { fontSize: 14, fontWeight: '800', color: AP.secondary },
  rtAgo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase', marginTop: 2 },
  rtAmount: { fontSize: 14, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
});
