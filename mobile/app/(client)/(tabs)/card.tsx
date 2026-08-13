import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet } from '@/wallet-store';

const FULL_NUMBER = '4532 8812 0990 4122';

function maskNumber(full: string, reveal: boolean) {
  if (reveal) return full;
  const groups = full.split(' ');
  return groups.map((g, i) => (i === 0 || i === groups.length - 1 ? g : '••••')).join(' ');
}

export default function CardScreen() {
  const { card, toggleFreeze, toggleCardSetting } = useWallet();
  const [reveal, setReveal] = useState(false);
  const remaining = Math.round(card.monthlyLimitCents * 0.684);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Virtual Card</Text>
          <Pressable style={s.iconBtn}>
            <Icon name="settings" size={20} color={AP.secondary} />
          </Pressable>
        </View>

        {/* Card */}
        <View style={s.card}>
          <View style={s.cardGlow} />
          <View style={s.cardTop}>
            <View style={{ gap: 8 }}>
              <Text style={s.cardBrandLabel}>AlphaPay Platinum</Text>
              <View style={s.chip} />
            </View>
            <Text style={s.visa}>VISA</Text>
          </View>
          <View style={{ gap: 20 }}>
            <Text style={s.cardNumber}>{maskNumber(FULL_NUMBER, reveal)}</Text>
            <View style={s.cardMeta}>
              <View>
                <Text style={s.metaLabel}>Expiry</Text>
                <Text style={s.metaValue}>{card.expiry}</Text>
              </View>
              <View>
                <Text style={s.metaLabel}>CVV</Text>
                <Text style={s.metaValue}>{reveal ? '184' : '•••'}</Text>
              </View>
            </View>
            <View style={s.cardBottom}>
              <Text style={s.holder}>{card.holder.toUpperCase()}</Text>
              <View style={s.contactless}>
                <Icon name="contactless" size={20} color={AP.primary} />
              </View>
            </View>
          </View>
          {card.frozen && (
            <View style={s.frozenOverlay}>
              <Icon name="snowflake" size={40} color="#fff" />
              <Text style={s.frozenText}>CARD FROZEN</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <Pressable style={({ pressed }) => [s.actionCard, pressed && s.pressed]} onPress={() => setReveal((r) => !r)}>
            <View style={[s.actionIcon, { backgroundColor: soft.primary10 }]}>
              <Icon name={reveal ? 'eye-off' : 'eye'} size={24} color={AP.primary} />
            </View>
            <Text style={s.actionLabel}>{reveal ? 'Hide Details' : 'Show Details'}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.actionCard, pressed && s.pressed]} onPress={toggleFreeze}>
            <View style={[s.actionIcon, { backgroundColor: card.frozen ? soft.primary10 : soft.chart4_10 }]}>
              <Icon name="snowflake" size={24} color={card.frozen ? AP.primary : AP.chart4} />
            </View>
            <Text style={s.actionLabel}>{card.frozen ? 'Unfreeze Card' : 'Freeze Card'}</Text>
          </Pressable>
        </View>

        {/* Control center */}
        <Text style={s.sectionLabel}>Control Center</Text>
        <View style={s.group}>
          <View style={s.ctrlRow}>
            <View style={s.ctrlLeft}>
              <View style={s.ctrlIcon}><Icon name="bar-chart-3" size={22} color="rgba(11,30,61,0.4)" /></View>
              <View>
                <Text style={s.ctrlTitle}>Monthly Limit</Text>
                <Text style={s.ctrlSub}>Remaining: {formatXAF(remaining)} XAF</Text>
              </View>
            </View>
            <Text style={s.ctrlValue}>{formatXAF(card.monthlyLimitCents)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.ctrlRow}>
            <View style={s.ctrlLeft}>
              <View style={s.ctrlIcon}><Icon name="shield-check" size={22} color="rgba(11,30,61,0.4)" /></View>
              <View>
                <Text style={s.ctrlTitle}>Online Security</Text>
                <Text style={s.ctrlSub}>3D Secure {card.secure3d ? 'Enabled' : 'Disabled'}</Text>
              </View>
            </View>
            <Switch value={card.secure3d} onValueChange={() => toggleCardSetting('secure3d')} trackColor={{ true: AP.primary, false: AP.muted }} thumbColor="#fff" />
          </View>
          <View style={s.divider} />
          <View style={s.ctrlRow}>
            <View style={s.ctrlLeft}>
              <View style={s.ctrlIcon}><Icon name="public" size={22} color="rgba(11,30,61,0.4)" /></View>
              <View>
                <Text style={s.ctrlTitle}>Global Payments</Text>
                <Text style={s.ctrlSub}>International Usage</Text>
              </View>
            </View>
            <Switch value={card.onlinePayments} onValueChange={() => toggleCardSetting('onlinePayments')} trackColor={{ true: AP.primary, false: AP.muted }} thumbColor="#fff" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  pressed: { opacity: 0.95, transform: [{ scale: 0.97 }] },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: AP.secondary },
  iconBtn: { width: 40, height: 40, borderRadius: radius.xl, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },

  card: { aspectRatio: 1.58, borderRadius: 32, backgroundColor: AP.secondary, padding: 28, justifyContent: 'space-between', overflow: 'hidden', ...shadow(20, AP.secondary, 0.25) },
  cardGlow: { position: 'absolute', top: -40, right: -20, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,180,216,0.15)' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardBrandLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 3, color: AP.primary, textTransform: 'uppercase' },
  chip: { width: 44, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  visa: { fontSize: 26, fontWeight: '900', fontStyle: 'italic', color: '#fff', letterSpacing: 1 },
  cardNumber: { fontSize: 21, fontWeight: '800', letterSpacing: 3, color: '#fff', fontVariant: ['tabular-nums'] },
  cardMeta: { flexDirection: 'row', gap: 32 },
  metaLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' },
  metaValue: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 2, fontVariant: ['tabular-nums'] },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  holder: { fontSize: 14, fontWeight: '900', letterSpacing: 1, color: '#fff' },
  contactless: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,180,216,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  frozenOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,30,61,0.6)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  frozenText: { fontSize: 12, fontWeight: '900', letterSpacing: 2, color: '#fff' },

  actions: { flexDirection: 'row', gap: 16, marginTop: 24 },
  actionCard: { flex: 1, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 20, alignItems: 'center', gap: 8, ...shadow(2) },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '700', color: AP.secondary, letterSpacing: 0.5, textTransform: 'uppercase' },

  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase', marginTop: 28, marginBottom: 16, marginLeft: 4 },
  group: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxxl, overflow: 'hidden', ...shadow(2) },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24 },
  ctrlLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ctrlIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: soft.muted50, alignItems: 'center', justifyContent: 'center' },
  ctrlTitle: { fontSize: 14, fontWeight: '700', color: AP.secondary },
  ctrlSub: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: AP.mutedForeground, textTransform: 'uppercase', marginTop: 2 },
  ctrlValue: { fontSize: 14, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: AP.border },
});
