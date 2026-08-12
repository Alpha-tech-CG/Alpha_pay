import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet, type TopUpSource } from '@/wallet-store';

const QUICK = [5000, 10000, 25000];

const BRAND: Record<TopUpSource['brand'], { bg: string; fg: string; label: string }> = {
  mtn: { bg: AP.mtn, fg: '#000', label: 'MTN' },
  airtel: { bg: AP.airtel, fg: '#fff', label: 'airtel' },
  card: { bg: AP.secondary, fg: '#fff', label: '' },
};

export default function TopUp() {
  const router = useRouter();
  const { topUpSources, topUp } = useWallet();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<TopUpSource>(topUpSources[0]);

  const amountCents = Math.round((parseFloat(amount) || 0) * 100);
  const canConfirm = amountCents > 0 && !source.disabled;

  const confirm = () => {
    if (amountCents <= 0) { Alert.alert('Montant', 'Entrez un montant à ajouter.'); return; }
    topUp(source, amountCents);
    Alert.alert('Dépôt confirmé', `${formatXAF(amountCents)} XAF ajoutés via ${source.name}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.back} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={AP.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>Top-up Wallet</Text>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.sectionLabel}>AMOUNT TO ADD</Text>
          <View style={s.amountCard}>
            <View style={s.amountRow}>
              <Text style={s.amountCurrency}>XAF</Text>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={s.amountInput}
                placeholder="0"
                placeholderTextColor={AP.mutedForeground}
              />
            </View>
            <View style={s.quickRow}>
              {QUICK.map((q) => (
                <Pressable key={q} style={s.quickBtn} onPress={() => setAmount(String((parseInt(amount || '0', 10)) + q))}>
                  <Text style={s.quickText}>+ {q.toLocaleString('fr-FR').replace(/\s/g, ',')}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[s.sectionLabel, { marginTop: 32 }]}>SELECT SOURCE</Text>
          <View style={{ gap: 12 }}>
            {topUpSources.map((src) => {
              const b = BRAND[src.brand];
              const selected = source.id === src.id;
              return (
                <Pressable
                  key={src.id}
                  style={[s.source, selected && s.sourceSelected, src.disabled && s.sourceDisabled]}
                  onPress={() => !src.disabled && setSource(src)}
                  disabled={src.disabled}
                >
                  <View style={s.sourceLeft}>
                    <View style={[s.sourceBadge, { backgroundColor: b.bg }]}>
                      {src.brand === 'card'
                        ? <Icon name="credit-card" size={22} color="#fff" />
                        : <Text style={[s.sourceBadgeText, { color: b.fg }]}>{b.label}</Text>}
                    </View>
                    <View>
                      <Text style={s.sourceName}>{src.name}</Text>
                      <Text style={s.sourceHint}>{src.hint}</Text>
                    </View>
                  </View>
                  <View style={[s.radio, selected && s.radioOn]}>
                    {selected && <View style={s.radioDot} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable style={[s.cta, !canConfirm && s.ctaDisabled, shadow(8, AP.primary, 0.2)]} onPress={confirm} disabled={!canConfirm}>
            <Text style={s.ctaText}>Confirm Deposit</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  back: { width: 40, height: 40, borderRadius: radius.full, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: AP.foreground },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },

  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: AP.mutedForeground, marginBottom: 16 },
  amountCard: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, padding: 24, gap: 24 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  amountCurrency: { fontSize: 22, fontWeight: '700', color: AP.mutedForeground },
  amountInput: { fontSize: 36, fontWeight: '800', color: AP.foreground, minWidth: 120, textAlign: 'center', fontVariant: ['tabular-nums'], padding: 0 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: { flex: 1, height: 40, backgroundColor: soft.muted50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 12, fontWeight: '700', color: AP.foreground },

  source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl },
  sourceSelected: { borderColor: AP.primary },
  sourceDisabled: { opacity: 0.6 },
  sourceLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  sourceBadge: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sourceBadgeText: { fontSize: 13, fontWeight: '900' },
  sourceName: { fontSize: 15, fontWeight: '700', color: AP.foreground },
  sourceHint: { fontSize: 12, color: AP.mutedForeground },
  radio: { width: 24, height: 24, borderRadius: radius.full, borderWidth: 2, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: AP.primary },
  radioDot: { width: 12, height: 12, borderRadius: radius.full, backgroundColor: AP.primary },

  footer: { paddingHorizontal: 20, paddingTop: 8 },
  cta: { height: 56, backgroundColor: AP.primary, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: 16, fontWeight: '700', color: AP.primaryForeground },
});
