// Primitives réutilisables pour les dashboards merchant / developer (mobile).
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, font } from '@/design';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[d.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={d.sectionRow}>
      <Text style={d.sectionTitle}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction}><Text style={d.sectionAction}>{action}</Text></Pressable>
      ) : null}
    </View>
  );
}

export function StatCard({ label, value, unit, delta, hint, trend }: {
  label: string; value: string; unit?: string; delta?: string; hint?: string; trend?: 'up' | 'flat';
}) {
  const good = trend === 'up';
  return (
    <View style={d.stat}>
      <Text style={d.statLabel}>{label}</Text>
      <View style={d.statValueRow}>
        <Text style={d.statValue}>{value}</Text>
        {unit ? <Text style={d.statUnit}>{unit}</Text> : null}
      </View>
      <View style={d.statFoot}>
        {delta ? (
          <View style={[d.deltaChip, { backgroundColor: soft.chart3_10 }]}>
            <Icon name="trending-up" size={12} color={AP.chart3} />
            <Text style={[d.deltaText, { color: AP.chart3 }]}>{delta}</Text>
          </View>
        ) : (
          <Icon name={good ? 'shield-check' : 'schedule'} size={14} color={good ? AP.chart3 : AP.mutedForeground} />
        )}
        {hint ? <Text style={d.statHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: 'ok' | 'bad' | 'muted' }) {
  const map = {
    ok: { fg: AP.chart3, bg: soft.chart3_10 },
    bad: { fg: AP.chart4, bg: soft.chart4_10 },
    muted: { fg: AP.mutedForeground, bg: soft.muted50 },
  }[tone];
  return (
    <View style={[d.pill, { backgroundColor: map.bg }]}>
      <Text style={[d.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <View style={d.code}>
      {lines.map((l, i) => (
        <Text key={i} style={d.codeLine}>{l}</Text>
      ))}
    </View>
  );
}

export function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={d.seg}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable key={o} style={[d.segItem, active && d.segActive]} onPress={() => onChange(o)}>
            <Text style={[d.segText, { color: active ? AP.secondary : AP.mutedForeground }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const d = StyleSheet.create({
  card: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, padding: 20, ...shadow(2) },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: AP.secondary },
  sectionAction: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: AP.primary, textTransform: 'uppercase' },

  stat: { flex: 1, minWidth: '46%', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, padding: 20, ...shadow(2) },
  statLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase', marginBottom: 12 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statValue: { fontSize: 24, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 12, fontWeight: '700', color: 'rgba(11,30,61,0.4)' },
  statFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.full },
  deltaText: { fontSize: 11, fontWeight: '800' },
  statHint: { fontSize: 11, fontWeight: '600', color: AP.mutedForeground, flexShrink: 1 },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.xs, alignSelf: 'flex-start' },
  pillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  code: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, padding: 16 },
  codeLine: { color: '#c9d1d9', fontFamily: font.mono, fontSize: 12, lineHeight: 20 },

  seg: { flexDirection: 'row', backgroundColor: soft.muted50, borderRadius: radius.md, padding: 4 },
  segItem: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.sm },
  segActive: { backgroundColor: AP.card, ...shadow(1) },
  segText: { fontSize: 12, fontWeight: '800' },
});
