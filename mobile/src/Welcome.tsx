// Accueil avant connexion : quatre écrans illustrés et animés (défilement avec parallaxe,
// pagination qui s'étire, défilement automatique jusqu'au premier geste).
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { B, F } from '@/brand';
import { PrimaryButton, Wordmark } from '@/bank';
import { FadeIn, reduceMotion } from '@/motion';
import { IllBudget, IllCollect, IllSavings, IllTransfer } from '@/illustrations';

const SLIDES = [
  { key: 'collect', Ill: IllCollect, title: 'Encaissez partout', text: 'QR code, lien de paiement, MTN MoMo, Airtel Money ou carte Visa : vos clients paient en quelques secondes.' },
  { key: 'budget', Ill: IllBudget, title: 'Un rôle pour chaque franc', text: 'Enveloppes, catégories automatiques et alertes avant de dépasser votre budget.' },
  { key: 'savings', Ill: IllSavings, title: 'Épargnez sans y penser', text: 'Objectifs, arrondi automatique de vos dépenses et progression en temps réel.' },
  { key: 'transfer', Ill: IllTransfer, title: 'Envoyez avec @AlphaPay', text: 'Un identifiant ou un QR suffit : plus besoin de partager vos coordonnées bancaires.' },
];

export function Welcome({ onSignUp, onSignIn }: { onSignUp: () => void; onSignIn: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scroller = useRef<any>(null);
  const [page, setPage] = useState(0);
  const touched = useRef(false);
  const illSize = Math.min(width * 0.78, height * 0.38);

  // Défilement automatique toutes les 4,5 s, arrêté dès que l'utilisateur fait défiler.
  useEffect(() => {
    if (reduceMotion()) return;
    const id: ReturnType<typeof setInterval> = setInterval(() => {
      if (touched.current) return clearInterval(id);
      setPage((p) => {
        const next = (p + 1) % SLIDES.length;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [width]);

  return (
    <View style={[s.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={s.glow} />
      <View style={s.glow2} />
      <FadeIn style={s.top}>
        <Wordmark size={28} />
        <Text style={s.skip} onPress={onSignIn} accessibilityRole="button">Se connecter</Text>
      </FadeIn>

      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (touched.current = true)}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        style={{ flexGrow: 0 }}
      >
        {SLIDES.map(({ key, Ill, title, text }, i) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          const illX = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.35, 0, -width * 0.35] });
          const textX = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.6, 0, -width * 0.6] });
          const fade = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          const scale = scrollX.interpolate({ inputRange: range, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' });
          return (
            <View key={key} style={[s.slide, { width }]} accessible accessibilityLabel={`${title}. ${text}`}>
              <Animated.View style={{ transform: [{ translateX: illX }, { scale }], opacity: fade }}>
                <Ill size={illSize} />
              </Animated.View>
              <Animated.View style={[s.copy, { transform: [{ translateX: textX }], opacity: fade }]}>
                <Text style={s.title}>{title}</Text>
                <Text style={s.text}>{text}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={s.dots}>
        {SLIDES.map((sl, i) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          return (
            <Animated.View
              key={sl.key}
              style={[s.dot, {
                opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' }),
                transform: [{ scaleX: scrollX.interpolate({ inputRange: range, outputRange: [1, 3, 1], extrapolate: 'clamp' }) }],
              }]}
            />
          );
        })}
      </View>

      <FadeIn delay={250} style={s.ctas}>
        <PrimaryButton label="Créer mon compte gratuit" icon="arrow-forward" onPress={onSignUp} />
        <PrimaryButton label="J’ai déjà un compte" variant="ghost" onPress={onSignIn} />
        <Text style={s.legal}>{page === 3 ? 'AlphaPay ne détient pas votre argent : il reste sur votre MoMo, votre banque ou votre carte.' : 'Gratuit, sans engagement. Mode test disponible tout de suite.'}</Text>
      </FadeIn>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.navy, overflow: 'hidden', justifyContent: 'space-between' },
  glow: { position: 'absolute', width: 380, height: 380, borderRadius: 190, backgroundColor: B.navy3, opacity: 0.45, top: -160, right: -140 },
  glow2: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: B.burgundy, opacity: 0.3, bottom: -110, left: -90 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  skip: { fontFamily: F.semibold, fontSize: 15, color: B.mustard, padding: 10 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 22 },
  copy: { alignItems: 'center', gap: 10 },
  title: { fontFamily: F.bold, fontSize: 28, color: B.white, textAlign: 'center', letterSpacing: -0.6 },
  text: { fontFamily: F.regular, fontSize: 16, color: B.onNavyMuted, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: B.mustard },
  ctas: { paddingHorizontal: 22, gap: 10 },
  legal: { fontFamily: F.regular, fontSize: 12, color: B.onNavyMuted, textAlign: 'center', lineHeight: 18, minHeight: 36 },
});
