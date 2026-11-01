// Carte virtuelle AlphaPay Business (Visa), démonstration : aucun numéro réel, seuls
// 4 chiffres dérivés du marchand ; l'émission passera par la banque émettrice partenaire.
// Recto / verso avec retournement 3D au toucher, et légère flottaison.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { LogoMark } from '@/bank';
import { B, F } from '@/brand';
import { reduceMotion } from '@/motion';

export function demoLast4(seed: string): string {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 10000;
  return String(h).padStart(4, '0');
}

export function demoExpiry(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String((d.getFullYear() + 4) % 100).padStart(2, '0')}`;
}

function Face({ width, children }: { width: number; children: React.ReactNode }) {
  const h = width / 1.586;
  return (
    <View style={[s.card, { width, height: h }]}>
      <View style={[s.glow, { width: width * 0.9, height: width * 0.9, borderRadius: width, top: -width * 0.45, right: -width * 0.3, backgroundColor: B.navy3 }]} />
      <View style={[s.glow, { width: width * 0.55, height: width * 0.55, borderRadius: width, bottom: -width * 0.28, left: -width * 0.12, backgroundColor: B.burgundy, opacity: 0.7 }]} />
      <View style={[s.stripe, { width: width * 1.4, left: -width * 0.2, top: h * 0.55 }]} />
      {children}
    </View>
  );
}

export function CardArt({ width, holder, last4, frozen }: { width: number; holder: string; last4: string; frozen?: boolean }) {
  const flip = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const [back, setBack] = useState(false);

  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [float]);

  const toggle = () => {
    const to = back ? 0 : 1;
    setBack(!back);
    if (reduceMotion()) flip.setValue(to);
    else Animated.spring(flip, { toValue: to, useNativeDriver: true, speed: 8, bounciness: 6 }).start();
  };

  const front = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const rear = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const lift = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const h = width / 1.586;

  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={back ? 'Voir le recto de la carte' : 'Retourner la carte'}>
      <Animated.View style={{ width, height: h, transform: [{ translateY: lift }] }}>
        <Animated.View style={[s.side, { transform: [{ perspective: 1000 }, { rotateY: front }] }]}>
          <Face width={width}>
            <View style={s.inner}>
              <View style={s.top}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LogoMark size={26} />
                  <Text style={s.brand}>AlphaPay</Text>
                </View>
                <Text style={s.kind}>BUSINESS</Text>
              </View>
              <View style={s.mid}>
                <View style={s.chip}><View style={s.chipLine} /><View style={[s.chipLine, { top: 15 }]} /></View>
                <Icon name="contactless" size={24} color={B.white} />
              </View>
              <Text style={[s.number, { fontSize: width * 0.058 }]}>••••  ••••  ••••  {last4}</Text>
              <View style={s.bottom}>
                <View style={{ flex: 1 }}>
                  <Text style={s.small}>TITULAIRE</Text>
                  <Text style={s.holder} numberOfLines={1}>{holder.toUpperCase()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 14 }}>
                  <Text style={s.small}>EXPIRE</Text>
                  <Text style={s.holder}>{demoExpiry()}</Text>
                </View>
                <Text style={[s.visa, { fontSize: width * 0.1 }]}>VISA</Text>
              </View>
            </View>
          </Face>
        </Animated.View>
        <Animated.View style={[s.side, { transform: [{ perspective: 1000 }, { rotateY: rear }] }]}>
          <Face width={width}>
            <View style={s.magnetic} />
            <View style={s.backBody}>
              <View style={s.signature}><Text style={s.cvv}>CVV •••</Text></View>
              <Text style={s.backText}>Carte virtuelle de démonstration. L’émission réelle sera assurée par la banque partenaire ; aucun paiement n’est possible pour l’instant.</Text>
            </View>
          </Face>
        </Animated.View>
        {frozen && (
          <View style={[s.frozen, { borderRadius: 18 }]}>
            <Icon name="snowflake" size={30} color={B.white} />
            <Text style={s.frozenText}>CARTE BLOQUÉE</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  side: { ...StyleSheet.absoluteFillObject, backfaceVisibility: 'hidden' },
  card: { backgroundColor: B.navy, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(212,160,23,0.35)' },
  glow: { position: 'absolute', opacity: 0.55 },
  stripe: { position: 'absolute', height: 1, backgroundColor: 'rgba(212,160,23,0.28)', transform: [{ rotate: '-12deg' }] },
  inner: { flex: 1, padding: 18, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: F.bold, fontSize: 16, color: B.white },
  kind: { fontFamily: F.semibold, fontSize: 11, color: B.mustard, letterSpacing: 2 },
  mid: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { width: 40, height: 30, borderRadius: 6, backgroundColor: B.mustard },
  chipLine: { position: 'absolute', left: 0, right: 0, top: 9, height: 1, backgroundColor: 'rgba(11,31,58,0.35)' },
  number: { fontFamily: F.medium, color: B.white, letterSpacing: 2.5 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end' },
  small: { fontFamily: F.medium, fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  holder: { fontFamily: F.semibold, fontSize: 13, color: B.white, marginTop: 2 },
  visa: { fontFamily: F.bold, fontStyle: 'italic', color: B.white, letterSpacing: 1 },
  magnetic: { height: 40, backgroundColor: '#050D19', marginTop: 22 },
  backBody: { flex: 1, padding: 18, gap: 12 },
  signature: { height: 34, backgroundColor: '#E9E4D8', borderRadius: 4, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10 },
  cvv: { fontFamily: F.semibold, fontSize: 12, color: B.navy },
  backText: { fontFamily: F.regular, fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },
  frozen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,31,58,0.75)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  frozenText: { fontFamily: F.bold, fontSize: 13, letterSpacing: 2, color: B.white },
});
