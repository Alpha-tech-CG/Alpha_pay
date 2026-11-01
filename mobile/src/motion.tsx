// Motion design : entrées en fondu montant échelonnées, pression ressort, compteur de
// montant, pulsation. Animated + pilote natif (transform/opacity sur le thread UI) ;
// tout est coupé quand « Réduire les animations » est activé sur le téléphone.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { M } from '@/brand';

let reduced = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduced = v)).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduced = v));
export const reduceMotion = () => reduced;

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** Fondu montant à l'apparition ; `index` échelonne les éléments d'une liste. */
export function FadeIn({ children, index = 0, delay = 0, distance = 14, style }: { children: ReactNode; index?: number; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: M.enter, delay: delay + Math.min(index, 10) * M.stagger, easing: easeOut, useNativeDriver: true }).start();
  }, [v, index, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Bouton qui s'enfonce légèrement (ressort) à la pression. */
// Propriétés de placement : portées par le Pressable extérieur, sinon flex / largeur
// en % s'appliqueraient à la vue animée intérieure et l'élément se tasserait.
const OUTER = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom', 'zIndex'] as const;

export function PressScale({ children, style, scaleTo = 0.97, ...props }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (value: number) => {
    if (reduced) return;
    Animated.spring(v, { toValue: value, useNativeDriver: true, speed: 40, bounciness: value === 1 ? 6 : 0 }).start();
  };
  const flat: Record<string, unknown> = { ...((StyleSheet.flatten(style) as object | undefined) ?? {}) };
  const outer: Record<string, unknown> = {};
  for (const key of OUTER) {
    if (key in flat) {
      outer[key] = flat[key];
      delete flat[key];
    }
  }
  if (outer.flex !== undefined || outer.width !== undefined) flat.flexGrow = 1;
  return (
    <Pressable {...props} style={outer as ViewStyle} onPressIn={(e) => { to(scaleTo); props.onPressIn?.(e); }} onPressOut={(e) => { to(1); props.onPressOut?.(e); }}>
      <Animated.View style={[flat as ViewStyle, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Valeur qui défile jusqu'à sa cible (montants de l'accueil). */
export function useCountUp(target: number, duration = M.hero) {
  const [value, setValue] = useState(reduced ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const start = Date.now();
    const origin = from.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(origin + (target - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Halo qui pulse en boucle (attente d'un paiement, indicateur live). */
export function Pulse({ size, color, style }: { size: number; color: string; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
        { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }] },
      ]}
    />
  );
}

/** Apparition « pop » (ressort) : coche de paiement reçu, QR. */
export function Pop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }).start();
  }, [v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>{children}</Animated.View>;
}

/** Bloc gris qui scintille pendant le chargement (squelette). */
export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: '#E4E1D9', opacity: v }, style]} />;
}
