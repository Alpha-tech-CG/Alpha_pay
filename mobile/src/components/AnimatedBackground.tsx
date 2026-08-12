import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';

/**
 * Fond animé très sobre : quelques bulles translucides qui montent/descendent
 * lentement. Décoratif, non interactif (pointerEvents none). Se place derrière
 * le contenu. S'adapte au thème (couleurs primaire / secondaire diluées).
 */
type Bubble = { size: number; left: string; delay: number; duration: number; travel: number; tint: 0 | 1 };

const BUBBLES: Bubble[] = [
  { size: 160, left: '-8%', delay: 0,    duration: 9000,  travel: 26, tint: 0 },
  { size: 110, left: '68%', delay: 800,  duration: 7500,  travel: 20, tint: 1 },
  { size: 70,  left: '30%', delay: 1600, duration: 8200,  travel: 16, tint: 0 },
  { size: 130, left: '78%', delay: 400,  duration: 10000, travel: 30, tint: 0 },
  { size: 60,  left: '10%', delay: 1200, duration: 6800,  travel: 14, tint: 1 },
];

function FloatingBubble({ b, color }: { b: Bubble; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: b.duration, delay: b.delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: b.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, b.delay, b.duration]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [b.travel, -b.travel] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.9, 0.5] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: `${(b.delay % 5) * 16 + 8}%`,
        left: b.left as never,
        width: b.size,
        height: b.size,
        borderRadius: b.size / 2,
        backgroundColor: color,
        transform: [{ translateY }],
        opacity,
      }}
    />
  );
}

export function AnimatedBackground() {
  const { C } = useTheme();
  const colors = useMemo(() => [C.primarySoft, C.secondaryContainer], [C.primarySoft, C.secondaryContainer]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {BUBBLES.map((b, i) => (
        <FloatingBubble key={i} b={b} color={colors[b.tint]} />
      ))}
    </View>
  );
}
