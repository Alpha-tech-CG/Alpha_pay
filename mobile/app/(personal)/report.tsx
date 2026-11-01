// Rapport mensuel : revenus, dépenses, épargne, envois AlphaPay, principales dépenses, conseil.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { EmptyLine, ErrorLine, Hero, Pill, Spinner, Surface, TopBar, useStatusBar } from '@/bank';
import { FadeIn } from '@/motion';
import { CategoryTile, fcfa, Gauge } from '@/personalUi';
import { personal } from '@/api';
import { useLoad } from '@/useLoad';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function monthKey(offset: number): string {
  const d = new Date(Date.now() + 3_600_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function Line({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={[s.lineValue, color ? { color } : null]}>{fcfa(value)}</Text>
    </View>
  );
}

export default function Report() {
  const router = useRouter();
  useStatusBar('light');
  const [offset, setOffset] = useState(0);
  const key = monthKey(offset);
  const r = useLoad(() => personal.report(key), [key]);
  const d = r.data;
  const top = d?.top_categories[0]?.amount || 1;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Hero style={{ paddingBottom: 22 }}>
          <View style={{ marginTop: -12, marginLeft: -14 }}><TopBar light onBack={() => (router.canGoBack() ? router.back() : router.replace('/(personal)/more'))} /></View>
          <Text style={s.title}>Rapport de {MONTHS[Number(key.slice(5)) - 1]}</Text>
          <View style={s.months}>{[0, 1, 2].map((o) => <Pill key={o} label={MONTHS[Number(monthKey(o).slice(5)) - 1]} active={offset === o} onPress={() => setOffset(o)} />)}</View>
        </Hero>
        <View style={s.body}>
          <ErrorLine message={r.error} />
          {r.loading && !d ? <Surface><Spinner /></Surface> : null}
          {d && (
            <>
              <Surface index={0}>
                <Line label="Revenus reçus" value={d.income} color={B.success} />
                <Line label="Dépenses" value={d.spent} />
                <Line label="Épargne" value={d.saved} color={B.mustardDeep} />
                <Line label="Envois AlphaPay" value={d.alphapay_sent} />
                <Line label="Réceptions AlphaPay" value={d.alphapay_received} color={B.success} />
                <View style={[s.line, { borderBottomWidth: 0 }]}>
                  <Text style={[s.lineLabel, { fontFamily: F.semibold, color: B.ink }]}>Solde du mois</Text>
                  <Text style={[s.lineValue, { color: d.income - d.spent >= 0 ? B.success : B.burgundy }]}>{d.income - d.spent >= 0 ? '+' : '-'}{fcfa(Math.abs(d.income - d.spent))}</Text>
                </View>
              </Surface>

              <Surface index={1} style={{ gap: 14 }}>
                <Text style={s.section}>Principales dépenses</Text>
                {d.top_categories.length === 0 && <EmptyLine title="Aucune dépense ce mois-ci" />}
                {d.top_categories.map((c, i) => (
                  <View key={c.category} style={s.cat}>
                    <Text style={s.rank}>{i + 1}</Text>
                    <CategoryTile category={c.category} size={36} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={s.catHead}>
                        <Text style={s.catName}>{c.category_name}</Text>
                        <Text style={s.catValue}>{fcfa(c.amount)}</Text>
                      </View>
                      <Gauge progress={(c.amount / top) * 100} color={i === 0 ? B.burgundy : i === 1 ? B.mustard : B.navy} />
                    </View>
                  </View>
                ))}
              </Surface>

              {d.advice && (
                <FadeIn index={2}>
                  <View style={s.advice}>
                    <View style={s.adviceIcon}><Icon name="trending-up" size={22} color={B.navy} /></View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.adviceTitle}>Conseil</Text>
                      <Text style={s.adviceText}>{d.advice.text}</Text>
                    </View>
                  </View>
                </FadeIn>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  title: { fontFamily: F.bold, fontSize: 26, color: B.white, marginTop: 6 },
  months: { flexDirection: 'row', gap: 8, marginTop: 14 },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: B.line },
  lineLabel: { fontFamily: F.regular, fontSize: 15, color: B.muted },
  lineValue: { fontFamily: F.semibold, fontSize: 15, color: B.ink },
  section: { fontFamily: F.semibold, fontSize: 18, color: B.ink },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { fontFamily: F.bold, fontSize: 16, color: B.muted, width: 16 },
  catHead: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { fontFamily: F.medium, fontSize: 14, color: B.ink },
  catValue: { fontFamily: F.semibold, fontSize: 14, color: B.ink },
  advice: { flexDirection: 'row', gap: 12, backgroundColor: B.mustardSoft, borderRadius: R.lg, padding: 16 },
  adviceIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: B.mustard, alignItems: 'center', justifyContent: 'center' },
  adviceTitle: { fontFamily: F.bold, fontSize: 15, color: B.navy },
  adviceText: { fontFamily: F.regular, fontSize: 14, color: B.ink, lineHeight: 21 },
});
