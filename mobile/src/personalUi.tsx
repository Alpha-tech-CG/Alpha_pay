// Briques de l'espace particulier : jauge animée, icônes de catégories et de comptes.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { reduceMotion } from '@/motion';
import type { PAccount, PEnvelope } from '@/api';

export const CATEGORY_ICON: Record<string, string> = {
  food: 'shopping-cart',
  transport: 'car',
  bills: 'home',
  health: 'shield-check',
  school: 'calendar',
  leisure: 'shapes',
  online: 'shopping-bag',
  transfers: 'send',
  savings: 'piggy-bank',
  income: 'payments',
  refund: 'replay',
  transfer_in: 'call-received',
  other: 'archive',
};

export const ACCOUNT_META: Record<PAccount['kind'], { label: string; bg: string; fg: string; text?: string; icon?: string }> = {
  mtn_momo: { label: 'MTN MoMo', bg: '#FFCC00', fg: '#000', text: 'MTN' },
  airtel_money: { label: 'Airtel Money', bg: '#E11900', fg: '#fff', text: 'airtel' },
  bank: { label: 'Compte bancaire', bg: B.navy, fg: B.mustard, icon: 'account-balance' },
  card: { label: 'Carte Visa', bg: B.navy3, fg: B.white, icon: 'credit-card' },
  cash: { label: 'Espèces', bg: B.successSoft, fg: B.success, icon: 'payments' },
};

export function AccountTile({ kind, size = 42 }: { kind: PAccount['kind']; size?: number }) {
  const m = ACCOUNT_META[kind];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center' }}>
      {m.text ? <Text style={{ fontFamily: F.bold, fontSize: size * 0.28, color: m.fg }}>{m.text}</Text> : <Icon name={m.icon!} size={size * 0.48} color={m.fg} />}
    </View>
  );
}

export function CategoryTile({ category, size = 42, tone = 'navy' }: { category: string; size?: number; tone?: 'navy' | 'income' }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: tone === 'income' ? B.successSoft : B.navySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={CATEGORY_ICON[category] ?? 'archive'} size={size * 0.48} color={tone === 'income' ? B.success : B.navy} />
    </View>
  );
}

/** Couleur d'une jauge : marine, puis moutarde au seuil d'alerte, bordeaux au-delà du budget. */
export function envelopeColor(e: Pick<PEnvelope, 'progress' | 'alert_threshold'>): string {
  if (e.progress >= 100) return B.burgundy;
  if (e.progress >= e.alert_threshold) return B.mustard;
  return B.navy;
}

/** Jauge qui se remplit à l'apparition. */
export function Gauge({ progress, color, height = 8 }: { progress: number; color: string; height?: number }) {
  const ratio = Math.max(0, Math.min(1, progress / 100));
  const v = useRef(new Animated.Value(reduceMotion() ? ratio : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: ratio, duration: 700, delay: 150, useNativeDriver: false }).start();
  }, [ratio, v]);
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

/** Petite statistique sur le bandeau marine. */
export function HeroStat({ label, value, tone }: { label: string; value: string; tone?: 'mustard' | 'burgundy' }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.statValue, tone === 'mustard' && { color: B.mustard }, tone === 'burgundy' && { color: '#F2A7B0' }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

export const fcfa = (v: number) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;

const s = StyleSheet.create({
  track: { backgroundColor: B.lineSoft, overflow: 'hidden' },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 10, gap: 3 },
  statLabel: { fontFamily: F.medium, fontSize: 11, color: B.onNavyMuted },
  statValue: { fontFamily: F.bold, fontSize: 15, color: B.white },
});
