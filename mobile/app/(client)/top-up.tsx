import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BigTitle, BrandTile, Label, PrimaryButton, Radio, TopBar, useStatusBar } from '@/components/UcKit';
import { UC, ucFont, splitAmount } from '@/uc';

const fmt = (cents: number) => splitAmount(cents).int;
import { useWallet } from '@/wallet-store';

const QUICK = [5000, 10000, 25000, 50000];

export default function TopUp() {
  const router = useRouter();
  useStatusBar('dark');
  const { topUpSources, topUp } = useWallet();
  const [amount, setAmount] = useState('');
  const [sourceId, setSourceId] = useState(topUpSources.find((x) => !x.disabled)?.id ?? topUpSources[0].id);

  const amountCents = Math.round((parseFloat(amount.replace(/[^0-9.]/g, '')) || 0) * 100);
  const source = topUpSources.find((x) => x.id === sourceId)!;
  const addQuick = (v: number) => setAmount(String((parseInt(amount || '0', 10) || 0) + v));

  const confirm = () => {
    if (amountCents <= 0) return Alert.alert('Montant', 'Saisissez un montant à ajouter.');
    if (source.disabled) return Alert.alert('Indisponible', 'Cette source n\'est pas encore disponible.');
    topUp(source, amountCents);
    Alert.alert('Recharge effectuée', `${fmt(amountCents)} XAF ajoutés via ${source.name}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <TopBar onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <BigTitle style={{ marginTop: 12, marginBottom: 24 }}>Recharger mon compte</BigTitle>

        <Label>Montant à ajouter</Label>
        <View style={s.amountRow}>
          <TextInput
            style={s.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={UC.line}
          />
          <Text style={s.amountCur}>XAF</Text>
        </View>
        <View style={s.quick}>
          {QUICK.map((v) => (
            <Pressable key={v} style={({ pressed }) => [s.chip, pressed && { backgroundColor: UC.ink }]} onPress={() => addQuick(v)}>
              {({ pressed }) => <Text style={[s.chipText, pressed && { color: UC.white }]}>+ {fmt(v * 100)}</Text>}
            </Pressable>
          ))}
        </View>

        <Label style={{ marginTop: 32, marginBottom: 6 }}>Source des fonds</Label>
        {topUpSources.map((src) => {
          const active = src.id === sourceId;
          return (
            <Pressable
              key={src.id}
              style={[s.source, src.disabled && { opacity: 0.45 }]}
              onPress={() => !src.disabled && setSourceId(src.id)}
            >
              <Radio on={active} />
              <BrandTile brand={src.brand} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={s.sourceName}>{src.name}</Text>
                <Text style={s.sourceHint}>{src.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <PrimaryButton label="Confirmer la recharge" disabled={amountCents <= 0} onPress={confirm} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1, borderBottomColor: UC.line },
  amountInput: { flex: 1, fontFamily: ucFont.condensed, fontSize: 42, fontWeight: '700', color: UC.ink, paddingVertical: 4 },
  amountCur: { fontFamily: ucFont.regular, fontSize: 22, color: UC.inkSoft, marginBottom: 12 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: ucFont.condensed, fontSize: 15, fontWeight: '700', color: UC.ink },
  source: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: UC.lineSoft },
  sourceName: { fontFamily: ucFont.condensed, fontSize: 18, fontWeight: '700', color: UC.ink },
  sourceHint: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted, marginTop: 2 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
});
