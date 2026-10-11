// Intro animée du logo AlphaPay (motion design) jouée au lancement de l'app.
// Séquence ≈ 2,6 s : le disque blanc arrive en rebond et en rotation, la flèche
// « envoi » le traverse en diagonale, deux ondes se propagent, le mot AlphaPay
// s'écrit lettre par lettre, puis l'ensemble s'efface en zoomant.
// Animated natif uniquement (pas de reanimated), tout sur le thread UI.
import { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LogoMark } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';

const SIZE = 112;
const WORD = 'AlphaPay'.split('');

export function LogoIntro({ onDone }: { onDone?: () => void }) {
  const disk = useRef(new Animated.Value(0)).current;
  const arrow = useRef(new Animated.Value(0)).current;
  const rings = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const letters = useRef(WORD.map(() => new Animated.Value(0))).current;
  const glow = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(150),
      Animated.spring(disk, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(arrow, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.8)), useNativeDriver: true }),
        Animated.stagger(200, rings.map((r) =>
          Animated.timing(r, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        )),
        Animated.sequence([
          Animated.delay(260),
          Animated.stagger(55, letters.map((l) =>
            Animated.timing(l, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          )),
        ]),
      ]),
      Animated.timing(glow, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(exit, { toValue: 1, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => { if (finished) onDone?.(); });
    return () => anim.stop();
    // L'intro ne se joue qu'une fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const diskStyle = {
    transform: [
      { scale: Animated.add(disk, Animated.multiply(glow, 0.06)) },
      { rotate: disk.interpolate({ inputRange: [0, 1], outputRange: ['-120deg', '0deg'] }) },
    ],
    opacity: disk.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
  };
  const arrowStyle = {
    opacity: arrow.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateX: arrow.interpolate({ inputRange: [0, 1], outputRange: [-SIZE * 0.7, 0] }) },
      { translateY: arrow.interpolate({ inputRange: [0, 1], outputRange: [SIZE * 0.7, 0] }) },
    ],
  };
  const groupStyle = {
    opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
  };

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Animated.View style={[s.center, groupStyle]}>
        <View style={s.logoBox}>
          {rings.map((r, i) => (
            <Animated.View
              key={i}
              style={[s.ring, {
                opacity: r.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.6, 0] }),
                transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              }]}
            />
          ))}
          <Animated.View style={[s.disk, diskStyle]}>
            <Animated.View style={arrowStyle}>
              <LogoMark size={SIZE} bg="transparent" />
            </Animated.View>
          </Animated.View>
        </View>

        <View style={s.word}>
          {WORD.map((ch, i) => (
            <Animated.Text
              key={i}
              style={[s.letter, {
                opacity: letters[i],
                transform: [{ translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              }]}
            >
              {ch}
            </Animated.Text>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.red, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  logoBox: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2, borderColor: UC.white },
  disk: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: UC.white, overflow: 'hidden' },
  word: { flexDirection: 'row', marginTop: 26 },
  letter: { fontFamily: ucFont.condensed, fontSize: 36, fontWeight: '700', color: UC.white, letterSpacing: -0.5 },
});
