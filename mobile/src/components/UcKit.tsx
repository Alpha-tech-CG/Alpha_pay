// Briques visuelles du design « banque » (écrans client).
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { View, Text, Image, Pressable, StyleSheet, type TextStyle, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { UC, ucFont, splitAmount } from '@/uc';
import type { Transaction } from '@/wallet-store';

/* ── Mode « masquer les montants » (œil de l'accueil), partagé entre écrans ── */
let amountsHidden = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useAmountsHidden(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, () => amountsHidden);
  return [hidden, () => { amountsHidden = !amountsHidden; listeners.forEach((l) => l()); }];
}

/* ── Couleur des icônes de la barre d'état, appliquée quand l'écran prend le focus ── */
export function useStatusBar(style: 'light' | 'dark') {
  useFocusEffect(useCallback(() => { setStatusBarStyle(style); }, [style]));
}

/* ── Logo : disque blanc + flèche « envoi » rouge ── */
export function LogoMark({ size = 40, color = UC.red, bg = UC.white }: { size?: number; color?: string; bg?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="48" fill={bg} />
      <Path d="M22 80 L66 26 L52 24 L56 14 L88 16 L80 46 L72 38 L30 86 Z" fill={color} />
    </Svg>
  );
}

export function Wordmark({ size = 30, color = UC.white }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.2 }}>
      <LogoMark size={size} color={color === UC.white ? UC.red : UC.white} bg={color} />
      <Text style={{ fontFamily: ucFont.condensed, fontWeight: '700', fontSize: size * 1.05, color, letterSpacing: -0.5 }}>
        AlphaPay
      </Text>
    </View>
  );
}

/* ── Montant : grosse partie entière + petites décimales + devise ── */
export function Amount({
  cents, currency = 'XAF', size = 34, color = UC.ink, signed = false, style, forceShow = false,
}: {
  cents: number; currency?: string; size?: number; color?: string; signed?: boolean;
  style?: StyleProp<TextStyle>; forceShow?: boolean;
}) {
  const [hidden] = useAmountsHidden();
  const { sign, int, dec } = splitAmount(cents);
  const prefix = signed ? (cents >= 0 ? '+' : '-') : sign;
  const small = { fontSize: size * 0.6, fontWeight: '400' as const };
  if (hidden && !forceShow) {
    return <Text style={[{ fontFamily: ucFont.condensed, fontSize: size, color, fontWeight: '700' }, style]}>••••<Text style={small}> {currency}</Text></Text>;
  }
  return (
    <Text style={[{ fontFamily: ucFont.condensed, fontSize: size, color, fontWeight: '700' }, style]}>
      {prefix}{int}<Text style={small}>,{dec} {currency}</Text>
    </Text>
  );
}

/* ── Avatar cerclé de rouge + pastille de notifications ── */
export function AvatarBadge({ uri, count, size = 50, onPress }: { uri: string; count?: number; size?: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <View style={[st.avatarRing, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image source={{ uri }} style={{ width: size - 8, height: size - 8, borderRadius: (size - 8) / 2, backgroundColor: UC.lineSoft }} />
      </View>
      {!!count && (
        <View style={st.badge}>
          <Text style={st.badgeText}>{count > 999 ? '999+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ── En-tête d'écran : gros titre condensé + actions à droite ── */
export function BigTitle({ children, color = UC.ink, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.bigTitle, { color }, style]}>{children}</Text>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[st.divider, style]} />;
}

/* ── Ligne « LIBELLÉ ........ ACTION > » (Gestion carte) ── */
export function LinkAction({ label, onPress, color = UC.teal }: { label: string; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={st.linkAction}>
      <Text style={[st.linkText, { color }]}>{label}</Text>
      <Icon name="chevron-right" size={16} color={color} />
    </Pressable>
  );
}

/* ── Boutons pleine largeur ── */
export function PrimaryButton({ label, onPress, disabled, variant = 'teal', icon }: {
  label: string; onPress?: () => void; disabled?: boolean; variant?: 'teal' | 'dark' | 'white'; icon?: string;
}) {
  const bg = disabled ? UC.tealSoft : variant === 'dark' ? UC.dark : variant === 'white' ? UC.white : UC.teal;
  const fg = variant === 'white' ? UC.ink : UC.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [st.btn, { backgroundColor: bg }, pressed && !disabled && { opacity: 0.85 }]}
    >
      {icon && <Icon name={icon} size={20} color={fg} />}
      <Text style={[st.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/* ── Barre du haut des écrans poussés : retour (ou fermer) + aide ── */
export function TopBar({ onBack, icon = 'chevron-left', color = UC.ink, help = true }: {
  onBack: () => void; icon?: 'chevron-left' | 'x' | 'chevron-down'; color?: string; help?: boolean;
}) {
  return (
    <View style={st.topBar}>
      <Icon name={icon} size={28} color={color} onPress={onBack} />
      {help && <HelpDot inverted={color !== UC.ink} />}
    </View>
  );
}

export function HelpDot({ inverted, onPress }: { inverted?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[st.help, inverted && { backgroundColor: UC.white }]}>
      <Text style={[st.helpText, inverted && { color: UC.ink }]}>?</Text>
    </Pressable>
  );
}

/* ── Petit libellé de section en capitales ── */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.label, style]}>{children}</Text>;
}

/* ── Bouton radio (cercle) ── */
export function Radio({ on }: { on: boolean }) {
  return (
    <View style={[st.radio, on && { borderColor: UC.teal }]}>
      {on && <View style={st.radioDot} />}
    </View>
  );
}

/* ── Tuile d'opérateur / banque (MTN jaune, Airtel rouge, etc.) ── */
export function BrandTile({ brand, label, size = 40 }: { brand: 'mtn' | 'airtel' | 'card' | 'bank'; label?: string; size?: number }) {
  const map = {
    mtn: { bg: '#FFCC00', fg: '#000', text: 'MTN' },
    airtel: { bg: '#E11900', fg: '#fff', text: 'airtel' },
    card: { bg: UC.dark, fg: '#fff', text: '' },
    bank: { bg: UC.bgGrey, fg: UC.ink, text: '' },
  }[brand];
  return (
    <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: map.bg, alignItems: 'center', justifyContent: 'center' }}>
      {brand === 'card'
        ? <Icon name="credit-card" size={size * 0.5} color="#fff" />
        : <Text style={{ fontFamily: ucFont.condensed, fontSize: size * 0.3, fontWeight: '700', color: map.fg }}>{label ?? map.text}</Text>}
    </View>
  );
}

/* ── Ligne de mouvement (accueil, historique, carte) ── */
export function TxLine({ tx, last }: { tx: Transaction; last?: boolean }) {
  const positive = tx.direction === 'in';
  return (
    <View>
      <View style={txs.txRow}>
        <View style={txs.txIcon}>
          {positive
            ? <Icon name="payments" size={22} color={UC.green} />
            : <View style={txs.txOutIcon}><Icon name="arrow-up-right" size={13} color={UC.white} /></View>}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={txs.txTitle} numberOfLines={1}>{tx.title}</Text>
          <Text style={txs.txSub} numberOfLines={1}>{tx.status === 'failed' ? 'Échoué · ' : ''}{tx.subtitle}</Text>
        </View>
        <Amount cents={tx.amountCents} signed size={21} color={positive ? UC.green : UC.ink} />
      </View>
      {!last && <Divider />}
    </View>
  );
}

const txs = StyleSheet.create({
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  txIcon: { width: 30, alignItems: 'center' },
  txOutIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: UC.inkSoft, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },
  txSub: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted },
});

const st = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  help: { width: 26, height: 26, borderRadius: 13, backgroundColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: UC.white, fontSize: 16, fontWeight: '900' },
  label: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, color: UC.inkSoft, textTransform: 'uppercase' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: UC.teal },
  avatarRing: { borderWidth: 2.5, borderColor: UC.red, alignItems: 'center', justifyContent: 'center', backgroundColor: UC.white },
  badge: { position: 'absolute', top: -3, right: -6, minWidth: 22, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: UC.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: UC.white },
  badgeText: { color: UC.white, fontSize: 10, fontWeight: '700' },
  bigTitle: { fontFamily: ucFont.condensed, fontSize: 30, fontWeight: '700', letterSpacing: -0.3 },
  divider: { height: 1, backgroundColor: UC.line },
  linkAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontFamily: ucFont.condensed, fontSize: 14, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  btn: { height: 54, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnText: { fontFamily: ucFont.condensed, fontSize: 18, fontWeight: '500' },
});
