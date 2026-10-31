import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Placeholder QR déterministe (pas de vraie lib QR) — motif stable à partir d'un seed
 * + cadre coin corail AlphaPay, comme la maquette receive-money.
 */
export function QRCode({ seed = 'alphapay', size = 220 }: { seed?: string; size?: number }) {
  const { C } = useTheme();
  const cells = 21;
  const bits: boolean[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  for (let i = 0; i < cells * cells; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    bits.push((h >> 8) % 100 < 48);
  }
  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);

  const pad = 24;
  const box = size + pad * 2;
  return (
    <View style={[styles.wrap, { width: box, height: box }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`}>
        {Array.from({ length: cells }).map((_, r) =>
          Array.from({ length: cells }).map((_, c) => {
            const on = finder(r, c) ? true : bits[r * cells + c];
            if (!on) return null;
            return <Rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#1A1A2E" />;
          }),
        )}
      </Svg>
      {/* AP center badge */}
      <View style={styles.center}>
        <View style={styles.badgeOuter}>
          <View style={[styles.badge, { backgroundColor: C.primary }]}>
            <Text style={[styles.badgeTxt, { color: C.onPrimary }]}>AP</Text>
          </View>
        </View>
      </View>
      {/* coral corners */}
      <View style={[styles.corner, styles.tl, { borderColor: C.primary }]} />
      <View style={[styles.corner, styles.tr, { borderColor: C.primary }]} />
      <View style={[styles.corner, styles.bl, { borderColor: C.primary }]} />
      <View style={[styles.corner, styles.br, { borderColor: C.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  badgeOuter: { backgroundColor: '#FFFFFF', padding: 4, borderRadius: 14 },
  badge: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontWeight: '900', fontSize: 13 },
  corner: { position: 'absolute', width: 30, height: 30, borderWidth: 4 },
  tl: { top: 14, left: 14, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  tr: { top: 14, right: 14, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bl: { bottom: 14, left: 14, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  br: { bottom: 14, right: 14, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
});
