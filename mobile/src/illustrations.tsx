// Illustrations vectorielles animées (marine, moutarde, bordeaux) de l'accueil et de la
// connexion. Chaque scène est faite de calques SVG ; les calques bougent par transform
// (pilote natif), et tout reste figé si « Réduire les animations » est activé.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { B } from '@/brand';
import { reduceMotion } from '@/motion';

/** Valeur 0 → 1 → 0 en boucle (sinusoïde). */
function useWave(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, duration, delay]);
  return v;
}

/** Valeur 0 → 1 en boucle continue (trajets, rotations). */
function useCycle(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v, duration, delay]);
  return v;
}

function Layer({ x, y, w, h, style, children }: { x: number; y: number; w: number; h: number; style?: StyleProp<ViewStyle> | any; children: ReactNode }) {
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y, width: w, height: h }, style]}>{children}</Animated.View>;
}

/** Halo de fond commun : disque dégradé et points décoratifs. */
function Backdrop({ size }: { size: number }) {
  const spin = useCycle(40000);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <>
      <Layer x={0} y={0} w={size} h={size}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="halo" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={B.navy3} stopOpacity="0.9" />
              <Stop offset="1" stopColor={B.navy2} stopOpacity="0.2" />
            </LinearGradient>
          </Defs>
          <Circle cx="50" cy="50" r="44" fill="url(#halo)" />
        </Svg>
      </Layer>
      <Layer x={0} y={0} w={size} h={size} style={{ transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="48" stroke={B.mustard} strokeOpacity="0.35" strokeWidth="0.4" strokeDasharray="1 3" fill="none" />
          <Circle cx="94" cy="40" r="1.6" fill={B.mustard} />
          <Circle cx="8" cy="62" r="1.2" fill="#F2A7B0" />
          <Circle cx="60" cy="3" r="1" fill={B.white} fillOpacity="0.7" />
        </Svg>
      </Layer>
    </>
  );
}

function Coin({ size, label = 'F' }: { size: number; label?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r="19" fill={B.mustardDeep} />
      <Circle cx="20" cy="18.5" r="17" fill={B.mustard} />
      <Circle cx="20" cy="18.5" r="12.5" fill="none" stroke={B.mustardSoft} strokeOpacity="0.6" strokeWidth="1.4" />
      <SvgText x="20" y="24" fontSize="15" fontWeight="bold" fill={B.navy} textAnchor="middle">{label}</SvgText>
    </Svg>
  );
}

/* ── 1. Encaisser : téléphone et QR, carte Visa, pièces ─────────────────── */
export function IllCollect({ size = 280 }: { size?: number }) {
  const u = size / 100;
  const float = useWave(3200);
  const float2 = useWave(2600, 400);
  const pulse = useWave(1800);
  const qr = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
  return (
    <View style={{ width: size, height: size }}>
      <Backdrop size={size} />
      <Layer x={22 * u} y={14 * u} w={42 * u} h={74 * u} style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}>
        <Svg width={42 * u} height={74 * u} viewBox="0 0 42 74">
          <Rect x="0" y="0" width="42" height="74" rx="7" fill={B.white} />
          <Rect x="3" y="7" width="36" height="58" rx="3" fill={B.bg} />
          <Rect x="16" y="2.5" width="10" height="1.6" rx="0.8" fill={B.line} />
          <Rect x="7" y="13" width="28" height="28" rx="2" fill={B.white} />
          <G>
            {qr.map((on, i) => (on ? <Rect key={i} x={9 + (i % 5) * 4.8} y={15 + Math.floor(i / 5) * 4.8} width="4" height="4" rx="0.6" fill={B.navy} /> : null))}
          </G>
          <Rect x="7" y="46" width="28" height="5" rx="2.5" fill={B.mustard} />
          <Rect x="11" y="55" width="20" height="2.4" rx="1.2" fill={B.line} />
        </Svg>
      </Layer>
      <Layer x={50 * u} y={44 * u} w={44 * u} h={28 * u} style={{ transform: [{ translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) }, { rotate: '-10deg' }] }}>
        <Svg width={44 * u} height={28 * u} viewBox="0 0 44 28">
          <Defs>
            <LinearGradient id="card" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={B.burgundy} />
              <Stop offset="1" stopColor={B.burgundyDeep} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="44" height="28" rx="3.5" fill="url(#card)" />
          <Rect x="4" y="8" width="8" height="6" rx="1.2" fill={B.mustard} />
          <Rect x="4" y="18" width="22" height="2" rx="1" fill={B.white} fillOpacity="0.7" />
          <SvgText x="40" y="24" fontSize="7" fontWeight="bold" fontStyle="italic" fill={B.white} textAnchor="end">VISA</SvgText>
        </Svg>
      </Layer>
      <Layer x={64 * u} y={14 * u} w={16 * u} h={16 * u} style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) }] }}>
        <Coin size={16 * u} />
      </Layer>
      <Layer x={8 * u} y={60 * u} w={12 * u} h={12 * u} style={{ transform: [{ translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }}>
        <Coin size={12 * u} />
      </Layer>
      <Layer x={55 * u} y={10 * u} w={13 * u} h={13 * u} style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) }] }}>
        <Svg width={13 * u} height={13 * u} viewBox="0 0 20 20">
          <Circle cx="10" cy="10" r="10" fill={B.success} />
          <Path d="M5.5 10.5 L8.6 13.4 L14.5 7" stroke={B.white} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Layer>
      <Layer x={2 * u} y={22 * u} w={20 * u} h={10 * u} style={{ transform: [{ translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) }] }}>
        <Svg width={20 * u} height={10 * u} viewBox="0 0 20 10">
          <Rect x="0" y="0" width="20" height="10" rx="5" fill="#FFCC00" />
          <SvgText x="10" y="7" fontSize="5.4" fontWeight="bold" fill="#000" textAnchor="middle">MoMo</SvgText>
        </Svg>
      </Layer>
    </View>
  );
}

/* ── 2. Budget : anneau de répartition qui tourne, enveloppes ───────────── */
export function IllBudget({ size = 280 }: { size?: number }) {
  const u = size / 100;
  const spin = useCycle(14000);
  const float = useWave(3000);
  const float2 = useWave(3400, 500);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const C = 2 * Math.PI * 15;
  const seg = (offset: number, len: number, color: string) => (
    <Circle cx="20" cy="20" r="15" fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${C * len} ${C}`} strokeDashoffset={-C * offset} strokeLinecap="round" />
  );
  const Env = ({ color, pct }: { color: string; pct: number }) => (
    <Svg width={40 * u} height={13 * u} viewBox="0 0 40 13">
      <Rect x="0" y="0" width="40" height="13" rx="3.5" fill={B.white} />
      <Circle cx="6.5" cy="6.5" r="3.5" fill={B.navySoft} />
      <Rect x="13" y="3.5" width="16" height="1.8" rx="0.9" fill={B.navy} fillOpacity="0.8" />
      <Rect x="13" y="8" width="23" height="2" rx="1" fill={B.lineSoft} />
      <Rect x="13" y="8" width={23 * pct} height="2" rx="1" fill={color} />
    </Svg>
  );
  return (
    <View style={{ width: size, height: size }}>
      <Backdrop size={size} />
      <Layer x={34 * u} y={12 * u} w={50 * u} h={50 * u} style={{ transform: [{ rotate }] }}>
        <Svg width={50 * u} height={50 * u} viewBox="0 0 40 40">
          <Circle cx="20" cy="20" r="15" fill="none" stroke={B.white} strokeOpacity="0.15" strokeWidth="7" />
          {seg(0, 0.38, B.mustard)}
          {seg(0.42, 0.24, B.white)}
          {seg(0.7, 0.24, '#C65A68')}
        </Svg>
      </Layer>
      <Layer x={47 * u} y={25 * u} w={24 * u} h={24 * u}>
        <Svg width={24 * u} height={24 * u} viewBox="0 0 24 24">
          <SvgText x="12" y="11" fontSize="4.2" fill={B.onNavyMuted} textAnchor="middle">Reste</SvgText>
          <SvgText x="12" y="17" fontSize="6.5" fontWeight="bold" fill={B.white} textAnchor="middle">62 %</SvgText>
        </Svg>
      </Layer>
      <Layer x={6 * u} y={52 * u} w={40 * u} h={13 * u} style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }}>
        <Env color={B.navy} pct={0.45} />
      </Layer>
      <Layer x={16 * u} y={68 * u} w={40 * u} h={13 * u} style={{ transform: [{ translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) }] }}>
        <Env color={B.mustard} pct={0.82} />
      </Layer>
      <Layer x={2 * u} y={22 * u} w={30 * u} h={13 * u} style={{ transform: [{ translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}>
        <Env color={B.burgundy} pct={1} />
      </Layer>
    </View>
  );
}

/* ── 3. Épargne : bocal qui se remplit, pièce qui tombe, objectif ───────── */
export function IllSavings({ size = 280 }: { size?: number }) {
  const u = size / 100;
  const drop = useCycle(2200);
  const float = useWave(3000);
  const ring = useWave(4000);
  return (
    <View style={{ width: size, height: size }}>
      <Backdrop size={size} />
      <Layer x={44 * u} y={4 * u} w={14 * u} h={14 * u} style={{ opacity: drop.interpolate({ inputRange: [0, 0.1, 0.75, 0.85, 1], outputRange: [0, 1, 1, 0, 0] }), transform: [{ translateY: drop.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 34 * u, 34 * u] }) }, { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '200deg'] }) }] }}>
        <Coin size={14 * u} />
      </Layer>
      <Layer x={28 * u} y={30 * u} w={46 * u} h={56 * u}>
        <Svg width={46 * u} height={56 * u} viewBox="0 0 46 56">
          <Rect x="8" y="0" width="30" height="7" rx="2.5" fill={B.mustard} />
          <Path d="M6 8 H40 Q46 8 46 16 V48 Q46 56 38 56 H8 Q0 56 0 48 V16 Q0 8 6 8 Z" fill={B.white} fillOpacity="0.12" stroke={B.white} strokeOpacity="0.8" strokeWidth="1.2" />
          {[0, 1, 2, 3].map((r) => (
            <G key={r}>
              <Rect x="6" y={44 - r * 7} width="15" height="6" rx="3" fill={r % 2 ? B.mustardDeep : B.mustard} />
              <Rect x="23" y={44 - r * 7} width="15" height="6" rx="3" fill={r % 2 ? B.mustard : B.mustardDeep} />
            </G>
          ))}
          <Rect x="5" y="14" width="3" height="20" rx="1.5" fill={B.white} fillOpacity="0.5" />
        </Svg>
      </Layer>
      <Layer x={70 * u} y={18 * u} w={24 * u} h={24 * u} style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) }, { rotate: ring.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) }] }}>
        <Svg width={24 * u} height={24 * u} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="11" fill={B.white} />
          <Circle cx="12" cy="12" r="8" fill="none" stroke={B.lineSoft} strokeWidth="2.4" />
          <Circle cx="12" cy="12" r="8" fill="none" stroke={B.burgundy} strokeWidth="2.4" strokeDasharray={`${2 * Math.PI * 8 * 0.75} 60`} strokeLinecap="round" transform="rotate(-90 12 12)" />
          <SvgText x="12" y="14.5" fontSize="6" fontWeight="bold" fill={B.navy} textAnchor="middle">75%</SvgText>
        </Svg>
      </Layer>
      <Layer x={6 * u} y={58 * u} w={18 * u} h={18 * u} style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }] }}>
        <Coin size={18 * u} />
      </Layer>
    </View>
  );
}

/* ── 4. AlphaPay : deux personnes, une pièce qui voyage, bouclier ───────── */
export function IllTransfer({ size = 280 }: { size?: number }) {
  const u = size / 100;
  const travel = useCycle(2600);
  const pulse = useWave(2000);
  const Person = ({ initials, color }: { initials: string; color: string }) => (
    <Svg width={26 * u} height={26 * u} viewBox="0 0 26 26">
      <Circle cx="13" cy="13" r="13" fill={B.white} />
      <Circle cx="13" cy="13" r="10.5" fill={color} />
      <SvgText x="13" y="16.5" fontSize="9" fontWeight="bold" fill={B.white} textAnchor="middle">{initials}</SvgText>
    </Svg>
  );
  return (
    <View style={{ width: size, height: size }}>
      <Backdrop size={size} />
      <Layer x={0} y={0} w={size} h={size}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Path d="M22 50 Q50 18 78 50" stroke={B.mustard} strokeWidth="1" strokeDasharray="2.5 2.5" fill="none" />
          <Path d="M78 58 Q50 86 22 58" stroke={B.white} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="2.5 2.5" fill="none" />
        </Svg>
      </Layer>
      <Layer x={8 * u} y={41 * u} w={26 * u} h={26 * u}><Person initials="ZM" color={B.navy3} /></Layer>
      <Layer x={66 * u} y={41 * u} w={26 * u} h={26 * u}><Person initials="MO" color={B.burgundy} /></Layer>
      <Layer
        x={15 * u}
        y={42 * u}
        w={14 * u}
        h={14 * u}
        style={{
          opacity: travel.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, 56 * u] }) },
            { translateY: travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -18 * u, 0] }) },
          ],
        }}
      >
        <Coin size={14 * u} label="@" />
      </Layer>
      <Layer x={40 * u} y={66 * u} w={20 * u} h={22 * u} style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }] }}>
        <Svg width={20 * u} height={22 * u} viewBox="0 0 20 22">
          <Path d="M10 0 L20 4 V11 Q20 18 10 22 Q0 18 0 11 V4 Z" fill={B.success} />
          <Path d="M5.5 11 L8.6 14 L14.5 8" stroke={B.white} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Layer>
    </View>
  );
}

