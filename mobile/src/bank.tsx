// Kit d'interface AlphaPay : bleu marine, jaune moutarde, rouge bordeaux (src/brand.ts),
// IBM Plex Sans, surfaces blanches sur fond chaud, retour tactile animé (src/motion.tsx).
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { B, F, R, shadow } from '@/brand';
import { FadeIn, PressScale, Skeleton } from '@/motion';

/* ── Masquer les montants (œil de l'accueil), partagé entre écrans ── */
let amountsHidden = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export function useAmountsHidden(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, () => amountsHidden);
  return [hidden, () => {
    amountsHidden = !amountsHidden;
    listeners.forEach((l) => l());
  }];
}

/** Couleur des icônes de la barre d'état, appliquée quand l'écran prend le focus. */
export function useStatusBar(style: 'light' | 'dark') {
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(style);
  }, [style]));
}

export function LogoMark({ size = 40, color = B.white, bg = B.burgundy }: { size?: number; color?: string; bg?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="48" fill={bg} />
      <Path d="M22 80 L66 26 L52 24 L56 14 L88 16 L80 46 L72 38 L30 86 Z" fill={color} />
      <Circle cx="78" cy="78" r="9" fill={B.mustard} />
    </Svg>
  );
}

export function Wordmark({ size = 30, color = B.white }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.28 }}>
      <LogoMark size={size} />
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.95, color, letterSpacing: -0.6 }}>
        Alpha<Text style={{ color: B.mustard }}>Pay</Text>
      </Text>
    </View>
  );
}

const group = (v: number) => Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Montant en unités majeures (XAF sans décimales), chiffres tabulaires. */
export function Amount({ value, currency = 'XAF', size = 34, color = B.ink, sign, style, forceShow }: {
  value: number; currency?: string; size?: number; color?: string; sign?: '+' | '-'; style?: StyleProp<TextStyle>; forceShow?: boolean;
}) {
  const [hidden] = useAmountsHidden();
  return (
    <Text style={[{ fontFamily: F.bold, fontSize: size, color, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }, style]} numberOfLines={1} adjustsFontSizeToFit>
      {hidden && !forceShow ? '• • • •' : `${sign ?? ''}${group(value)}`}
      <Text style={{ fontFamily: F.medium, fontSize: size * 0.48, letterSpacing: 0 }}> {currency}</Text>
    </Text>
  );
}

/** Pastille aux initiales : marine, anneau moutarde. */
export function Initials({ name, size = 44, onPress, light }: { name: string; size?: number; onPress?: () => void; light?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'A';
  return (
    <PressScale onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel="Profil et réglages" style={[st.ring, { width: size, height: size, borderRadius: size / 2, backgroundColor: light ? B.white : B.navy }]}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.36, color: light ? B.navy : B.mustard }}>{initials}</Text>
    </PressScale>
  );
}

export function BigTitle({ children, color = B.ink, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.bigTitle, { color }, style]}>{children}</Text>;
}

/** Bandeau marine arrondi en tête d'écran (titre, sous-titre, actions, contenu). */
export function Hero({ title, subtitle, right, children, style }: { title?: string; subtitle?: string; right?: ReactNode; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.hero, { paddingTop: insets.top + 12 }, style]}>
      <View style={st.heroGlow} />
      <View style={st.heroGlow2} />
      {(title || right) && (
        <View style={st.heroHead}>
          <View style={{ flex: 1, gap: 2 }}>
            {title ? <Text style={st.heroTitle}>{title}</Text> : null}
            {subtitle ? <Text style={st.heroSub}>{subtitle}</Text> : null}
          </View>
          <View style={st.headerRight}>{right}</View>
        </View>
      )}
      {children}
    </View>
  );
}

/** En-tête clair d'onglet. */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={st.tabHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <BigTitle>{title}</BigTitle>
        {subtitle ? <Text style={st.sub}>{subtitle}</Text> : null}
      </View>
      <View style={st.headerRight}>{right}</View>
    </View>
  );
}

/** Barre des écrans poussés : retour. */
export function TopBar({ onBack, title, light }: { onBack: () => void; title?: string; light?: boolean }) {
  const c = light ? B.white : B.ink;
  return (
    <View style={st.topBar}>
      <PressScale onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Retour" style={[st.backBtn, light && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
        <Icon name="chevron-left" size={24} color={c} />
      </PressScale>
      {title ? <Text style={[st.topTitle, { color: c }]}>{title}</Text> : null}
    </View>
  );
}

/** Carte blanche. */
export function Surface({ children, style, index }: { children: ReactNode; style?: StyleProp<ViewStyle>; index?: number }) {
  const body = <View style={[st.surface, style]}>{children}</View>;
  return index === undefined ? body : <FadeIn index={index}>{body}</FadeIn>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[st.divider, style]} />;
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.label, style]}>{children}</Text>;
}

/** Titre de section avec action à droite (« Tout voir »). */
export function SectionHead({ title, onPress, action = 'Tout voir' }: { title: string; onPress?: () => void; action?: string }) {
  return (
    <View style={st.sectionHead}>
      <Text style={st.sectionTitle}>{title}</Text>
      {onPress ? (
        <Pressable onPress={onPress} hitSlop={10} style={st.sectionAction} accessibilityRole="button">
          <Text style={st.sectionActionText}>{action}</Text>
          <Icon name="chevron-right" size={16} color={B.navy3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Ligne de menu : pastille d'icône, libellé, sous-titre, chevron. */
export function MenuRow({ icon, label, sub, onPress, tone = 'navy', last }: { icon: string; label: string; sub?: string; onPress?: () => void; tone?: 'navy' | 'mustard' | 'burgundy'; last?: boolean }) {
  const c = { navy: [B.navySoft, B.navy], mustard: [B.mustardSoft, B.mustardDeep], burgundy: [B.burgundySoft, B.burgundy] }[tone];
  return (
    <>
      <PressScale style={st.menuRow} onPress={onPress} scaleTo={0.985} accessibilityRole="button">
        <View style={[st.menuIcon, { backgroundColor: c[0] }]}><Icon name={icon} size={20} color={c[1]} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.menuLabel, tone === 'burgundy' && { color: B.burgundy }]}>{label}</Text>
          {sub ? <Text style={st.menuSub}>{sub}</Text> : null}
        </View>
        {onPress ? <Icon name="chevron-right" size={18} color={B.muted} /> : null}
      </PressScale>
      {!last && <Divider style={{ marginLeft: 54 }} />}
    </>
  );
}

/** Ligne « libellé ........ valeur ». */
export function InfoRow({ label, value, last }: { label: string; value: string | null | undefined; last?: boolean }) {
  return (
    <>
      <View style={st.infoRow}>
        <Text style={st.infoLabel}>{label}</Text>
        <Text style={st.infoValue} selectable>{value || '—'}</Text>
      </View>
      {!last && <Divider />}
    </>
  );
}

type Variant = 'mustard' | 'navy' | 'outline' | 'burgundy' | 'white' | 'ghost' | 'teal' | 'dark' | 'red';
const VARIANT: Record<Variant, { bg: string; fg: string; border?: string }> = {
  mustard: { bg: B.mustard, fg: B.navy },
  teal: { bg: B.mustard, fg: B.navy },
  navy: { bg: B.navy, fg: B.white },
  dark: { bg: B.navy, fg: B.white },
  outline: { bg: 'transparent', fg: B.navy, border: B.navy },
  burgundy: { bg: B.burgundy, fg: B.white },
  red: { bg: B.burgundy, fg: B.white },
  white: { bg: B.white, fg: B.navy },
  ghost: { bg: 'rgba(255,255,255,0.12)', fg: B.white },
};

export function PrimaryButton({ label, onPress, disabled, busy, variant = 'mustard', icon, style }: {
  label: string; onPress?: () => void; disabled?: boolean; busy?: boolean; variant?: Variant; icon?: string; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  const v = VARIANT[variant];
  return (
    <PressScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={[st.btn, { backgroundColor: v.bg }, v.border && { borderWidth: 1.5, borderColor: v.border }, (variant === 'mustard' || variant === 'teal') && !off && shadow(1), off && { opacity: 0.45 }, style]}
    >
      {busy ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon && <Icon name={icon} size={20} color={v.fg} />}
          <Text style={[st.btnText, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </PressScale>
  );
}

/** Champ à libellé visible, bordure marine au focus. */
export function LineField({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#98A1B2"
        {...props}
        onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
        style={[st.input, focus && st.inputFocus]}
      />
      {hint ? <Text style={st.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorLine({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <FadeIn distance={6}>
      <View style={st.error}>
        <Icon name="error-outline" size={18} color={B.burgundy} />
        <Text style={st.errorText}>{message}</Text>
      </View>
    </FadeIn>
  );
}

/** Chargement : squelette de lignes. */
export function Spinner({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ paddingVertical: 12, gap: 16 }} accessibilityLabel="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={12} />
            <Skeleton width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyLine({ title, body, icon = 'receipt-long' }: { title: string; body?: string; icon?: string }) {
  return (
    <FadeIn>
      <View style={st.empty}>
        <View style={st.emptyIcon}><Icon name={icon} size={26} color={B.navy3} /></View>
        <Text style={st.emptyTitle}>{title}</Text>
        {body ? <Text style={[st.hint, { textAlign: 'center' }]}>{body}</Text> : null}
      </View>
    </FadeIn>
  );
}

/** Filtre en pastille (actif en marine). */
export function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[st.pill, active && st.pillActive]}>
      <Text style={[st.pillText, active && { color: B.white }]}>{label}</Text>
    </PressScale>
  );
}

/** Pastille de statut sur fond doux. */
export function Tag({ label, tone }: { label: string; tone: 'ok' | 'bad' | 'wait' | 'muted' }) {
  const [bg, fg] = { ok: [B.successSoft, B.success], bad: [B.burgundySoft, B.burgundy], wait: [B.mustardSoft, B.warning], muted: [B.lineSoft, B.muted] }[tone];
  return (
    <View style={[st.tag, { backgroundColor: bg }]}>
      <Text style={[st.tagText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Tuile d'opérateur : MTN jaune, Airtel rouge, carte marine. */
export function BrandTile({ brand, size = 42 }: { brand: string; size?: number }) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    mtn: { bg: '#FFCC00', fg: '#000', text: 'MTN' },
    airtel: { bg: '#E11900', fg: '#fff', text: 'airtel' },
    card: { bg: B.navy, fg: '#fff', text: '' },
  };
  const m = map[brand] ?? map.mtn;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center' }}>
      {brand === 'card'
        ? <Icon name="credit-card" size={size * 0.48} color={B.mustard} />
        : <Text style={{ fontFamily: F.bold, fontSize: size * 0.28, color: m.fg }}>{m.text}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: B.mustard, alignItems: 'center', justifyContent: 'center' },
  bigTitle: { fontFamily: F.bold, fontSize: 28, letterSpacing: -0.6 },
  sub: { fontFamily: F.regular, fontSize: 14, color: B.muted },
  hero: { backgroundColor: B.navy, paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: B.navy3, opacity: 0.55, top: -110, right: -80 },
  heroGlow2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: B.burgundy, opacity: 0.35, bottom: -70, left: -40 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  heroTitle: { fontFamily: F.bold, fontSize: 26, color: B.white, letterSpacing: -0.5 },
  heroSub: { fontFamily: F.regular, fontSize: 14, color: B.onNavyMuted },
  tabHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: B.surface, ...shadow(1) },
  topTitle: { fontFamily: F.semibold, fontSize: 18 },
  surface: { backgroundColor: B.surface, borderRadius: R.lg, padding: 16, ...shadow(1) },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: B.line },
  label: { fontFamily: F.semibold, fontSize: 12, letterSpacing: 0.8, color: B.muted, textTransform: 'uppercase' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 6 },
  sectionTitle: { fontFamily: F.semibold, fontSize: 18, color: B.ink, letterSpacing: -0.2 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingLeft: 12 },
  sectionActionText: { fontFamily: F.semibold, fontSize: 14, color: B.navy3 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, minHeight: 56 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontFamily: F.medium, fontSize: 16, color: B.ink },
  menuSub: { fontFamily: F.regular, fontSize: 13, color: B.muted },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 13 },
  infoLabel: { fontFamily: F.regular, fontSize: 15, color: B.muted },
  infoValue: { fontFamily: F.medium, fontSize: 15, color: B.ink, flexShrink: 1, textAlign: 'right' },
  btn: { height: 54, borderRadius: R.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  btnText: { fontFamily: F.semibold, fontSize: 16, letterSpacing: 0.1 },
  fieldLabel: { fontFamily: F.medium, fontSize: 14, color: B.inkSoft },
  input: { fontFamily: F.regular, fontSize: 17, color: B.ink, backgroundColor: B.surface, borderWidth: 1.5, borderColor: B.line, borderRadius: R.md, paddingHorizontal: 14, height: 54 },
  inputFocus: { borderColor: B.navy },
  hint: { fontFamily: F.regular, fontSize: 13, color: B.muted, lineHeight: 19 },
  error: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: B.burgundySoft, borderRadius: R.md, padding: 12 },
  errorText: { flex: 1, fontFamily: F.medium, color: B.burgundy, fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 8, paddingHorizontal: 16 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: B.navySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: F.semibold, fontSize: 16, color: B.ink },
  pill: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: R.pill, backgroundColor: B.surface, borderWidth: 1, borderColor: B.line },
  pillActive: { backgroundColor: B.navy, borderColor: B.navy },
  pillText: { fontFamily: F.semibold, fontSize: 14, color: B.inkSoft },
  tag: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  tagText: { fontFamily: F.semibold, fontSize: 12 },
});
