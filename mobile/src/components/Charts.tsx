import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, type Palette } from '@/theme';

/** Simple bar chart — fixed-pixel bar heights (reliable in flex, like the web fix). */
export function BarChart({ data, height = 150 }: { data: { label: string; value: number }[]; height?: number }) {
  const { C } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={[styles.barRow, { height }]}>
      {data.map((d) => (
        <View key={d.label} style={styles.barCol}>
          <View
            style={{
              width: '62%',
              height: Math.max(4, (d.value / max) * (height - 26)),
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              backgroundColor: C.primary,
              opacity: 0.85,
            }}
          />
          <Text style={[styles.barLabel, { color: C.muted }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Two-segment donut (operator split) rendered with react-native-svg. */
export function DonutChart({ segments, size = 120 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
  const { C } = useTheme();
  const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0));
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.surfaceContainerHigh} strokeWidth={stroke} fill="none" />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * circ;
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={seg.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return el;
        })}
      </Svg>
      <View style={{ gap: 8 }}>
        {segments.map((seg) => (
          <View key={seg.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: seg.color }} />
            <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>{seg.label}</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>{Math.round((seg.value / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barLabel: { fontSize: 11, marginTop: 6 },
});
