import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet } from '@/wallet-store';

export default function VirtualCard() {
  const { card, toggleFreeze, toggleCardSetting } = useWallet();
  const [revealed, setRevealed] = useState(false);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Virtual Card</Text>

        {/* Carte */}
        <View style={[s.card, shadow(16, AP.secondary, 0.3)]}>
          <View style={s.cardTop}>
            <View style={{ gap: 4 }}>
              <Text style={s.cardKind}>VIRTUAL DEBIT</Text>
              <Text style={s.cardBrand}>AlphaPay</Text>
            </View>
            <Text style={s.visa}>VISA</Text>
          </View>
          <View style={{ gap: 16 }}>
            <Text style={s.cardNumber}>{card.number}</Text>
            <View style={s.cardBottom}>
              <View style={{ flexDirection: 'row', gap: 32 }}>
                <View style={{ gap: 2 }}>
                  <Text style={s.cardMetaLabel}>EXPIRY</Text>
                  <Text style={s.cardMetaValue}>{card.expiry}</Text>
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={s.cardMetaLabel}>CVV</Text>
                  <Text style={s.cardMetaValue}>{revealed ? '291' : '•••'}</Text>
                </View>
              </View>
              <Text style={s.cardHolder}>{card.holder}</Text>
            </View>
          </View>
          {card.frozen && (
            <View style={s.frozenOverlay}>
              <Icon name="snowflake" size={28} color="#fff" />
              <Text style={s.frozenText}>Carte gelée</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={s.actionsRow}>
          <Pressable style={s.actionBtn} onPress={() => setRevealed((v) => !v)}>
            <Icon name="eye" size={18} color={AP.primary} />
            <Text style={s.actionText}>{revealed ? 'Hide Details' : 'Reveal Details'}</Text>
          </Pressable>
          <Pressable style={[s.actionBtn, card.frozen && s.actionBtnActive]} onPress={toggleFreeze}>
            <Icon name="snowflake" size={18} color={card.frozen ? '#fff' : AP.primary} />
            <Text style={[s.actionText, card.frozen && { color: '#fff' }]}>{card.frozen ? 'Unfreeze' : 'Freeze Card'}</Text>
          </Pressable>
        </View>

        {/* Réglages */}
        <Text style={s.sectionTitle}>CARD SETTINGS</Text>
        <View style={s.settings}>
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <Icon name="bar-chart-3" size={18} color={AP.mutedForeground} />
              <Text style={s.settingLabel}>Monthly Limit</Text>
            </View>
            <Text style={s.settingValue}>{formatXAF(card.monthlyLimitCents)} XAF</Text>
          </View>
          <View style={s.divider} />
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <Icon name="shield-check" size={18} color={AP.mutedForeground} />
              <Text style={s.settingLabel}>3D Secure</Text>
            </View>
            <Switch
              value={card.secure3d}
              onValueChange={() => toggleCardSetting('secure3d')}
              trackColor={{ true: AP.primary, false: AP.muted }}
              thumbColor="#fff"
            />
          </View>
          <View style={s.divider} />
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <Icon name="globe" size={18} color={AP.mutedForeground} />
              <Text style={s.settingLabel}>Online Payments</Text>
            </View>
            <Switch
              value={card.onlinePayments}
              onValueChange={() => toggleCardSetting('onlinePayments')}
              trackColor={{ true: AP.primary, false: AP.muted }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 20, fontWeight: '700', color: AP.foreground, paddingTop: 8, paddingBottom: 24 },

  card: { width: '100%', aspectRatio: 1.6, borderRadius: radius.xxl, backgroundColor: AP.secondary, padding: 24, justifyContent: 'space-between', overflow: 'hidden' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardKind: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: 'rgba(255,255,255,0.8)' },
  cardBrand: { fontSize: 20, fontWeight: '700', letterSpacing: 1, color: '#fff' },
  visa: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: '#fff', letterSpacing: 1 },
  cardNumber: { fontSize: 22, fontWeight: '700', letterSpacing: 3, color: '#fff', fontVariant: ['tabular-nums'] },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardMetaLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1, color: 'rgba(255,255,255,0.7)' },
  cardMetaValue: { fontSize: 14, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  cardHolder: { fontSize: 14, fontWeight: '700', letterSpacing: 1, color: '#fff', textTransform: 'uppercase' },
  frozenOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,30,61,0.72)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  frozenText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 32 },
  actionBtn: { flex: 1, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionBtnActive: { backgroundColor: AP.primary, borderColor: AP.primary },
  actionText: { fontSize: 14, fontWeight: '700', color: AP.foreground },

  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: AP.mutedForeground, marginTop: 32, marginBottom: 16 },
  settings: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontSize: 14, fontWeight: '500', color: AP.foreground },
  settingValue: { fontSize: 14, fontWeight: '700', color: AP.foreground, fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: AP.border },
});
