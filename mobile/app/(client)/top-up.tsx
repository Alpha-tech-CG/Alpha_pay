import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet, type TopUpSource } from '@/wallet-store';

const QUICK = [5000, 10000, 25000];

function Brand({ source }: { source: TopUpSource }) {
  if (source.brand === 'mtn') return <View style={[s.brand, { backgroundColor: AP.mtn }]}><Text style={[s.brandText, { color: '#000' }]}>MTN</Text></View>;
  if (source.brand === 'airtel') return <View style={[s.brand, { backgroundColor: AP.airtel }]}><Text style={[s.brandText, { color: '#fff' }]}>airtel</Text></View>;
  return <View style={[s.brand, { backgroundColor: AP.secondary }]}><Icon name="credit-card" size={24} color="#fff" /></View>;
}

export default function TopUp() {
  const router = useRouter();
  const { topUpSources, topUp } = useWallet();
  const [amount, setAmount] = useState('');
  const [sourceId, setSourceId] = useState(topUpSources.find((x) => !x.disabled)?.id ?? topUpSources[0].id);

  const amountCents = Math.round((parseFloat(amount.replace(/[^0-9.]/g, '')) || 0) * 100);
  const source = topUpSources.find((x) => x.id === sourceId)!;
  const addQuick = (v: number) => setAmount(String((parseInt(amount || '0', 10) || 0) + v));

  const confirm = () => {
    if (amountCents <= 0) return Alert.alert('Amount', 'Enter an amount to add.');
    if (source.disabled) return Alert.alert('Unavailable', 'This source is not available yet.');
    topUp(source, amountCents);
    Alert.alert('Deposit successful', `${formatXAF(amountCents)} XAF added via ${source.name}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={AP.secondary} />
        </Pressable>
        <Text style={s.title}>Top-up Wallet</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionLabel}>Amount to add</Text>
        <View style={s.amountCard}>
          <View style={s.amountRow}>
            <Text style={s.amountCurrency}>XAF</Text>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="rgba(11,30,61,0.25)"
            />
          </View>
          <View style={s.quickRow}>
            {QUICK.map((v) => (
              <Pressable key={v} style={({ pressed }) => [s.quickChip, pressed && s.pressed]} onPress={() => addQuick(v)}>
                <Text style={s.quickText}>+ {v.toLocaleString('fr-FR').replace(/\s/g, ',')}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[s.sectionLabel, { marginTop: 32 }]}>Select Source</Text>
        <View style={{ gap: 12, marginTop: 16 }}>
          {topUpSources.map((src) => {
            const active = src.id === sourceId;
            return (
              <Pressable
                key={src.id}
                style={[s.source, active && s.sourceActive, src.disabled && { opacity: 0.6 }]}
                onPress={() => !src.disabled && setSourceId(src.id)}
              >
                <View style={s.sourceLeft}>
                  <Brand source={src} />
                  <View>
                    <Text style={s.sourceName}>{src.name}</Text>
                    <Text style={s.sourceHint}>{src.hint}</Text>
                  </View>
                </View>
                <View style={[s.radio, active && s.radioActive]}>
                  {active && <View style={s.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={({ pressed }) => [s.cta, pressed && s.pressed]} onPress={confirm}>
          <Text style={s.ctaText}>Confirm Deposit</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  title: { fontSize: 20, fontWeight: '700', color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },

  sectionLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: AP.mutedForeground, textTransform: 'uppercase', marginBottom: 16 },

  amountCard: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, padding: 24, gap: 24, ...shadow(2) },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  amountCurrency: { fontSize: 24, fontWeight: '700', color: AP.mutedForeground, fontVariant: ['tabular-nums'] },
  amountInput: { fontSize: 40, fontWeight: '800', color: AP.secondary, textAlign: 'center', minWidth: 160, fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickChip: { flex: 1, height: 40, borderRadius: radius.sm, backgroundColor: soft.muted50, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 12, fontWeight: '700', color: AP.secondary },

  source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.lg, padding: 16 },
  sourceActive: { borderColor: AP.primary, borderWidth: 1.5 },
  sourceLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  brand: { width: 48, height: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 13, fontWeight: '900' },
  sourceName: { fontSize: 15, fontWeight: '700', color: AP.secondary },
  sourceHint: { fontSize: 12, color: AP.mutedForeground, marginTop: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: AP.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: AP.primary },

  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  cta: { height: 56, backgroundColor: AP.primary, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', ...shadow(10, AP.primary, 0.25) },
  ctaText: { fontSize: 16, fontWeight: '800', color: AP.primaryForeground },
});
