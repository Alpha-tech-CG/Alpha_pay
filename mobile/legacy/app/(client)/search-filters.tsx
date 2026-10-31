import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { PrimaryButton, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';

// « Filtres de recherche » : renvoie vers l'historique avec la requête.
export default function SearchFilters() {
  const router = useRouter();
  useStatusBar('dark');
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);

  const cycle = (cur: string | null, opts: string[]) => opts[(cur ? opts.indexOf(cur) + 1 : 0) % opts.length];

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.top}>
        <Icon name="chevron-left" size={28} color={UC.ink} onPress={() => router.back()} />
        <View style={s.help}><Text style={s.helpText}>?</Text></View>
      </View>
      <View style={s.body}>
        <Text style={s.title}>Filtres de recherche</Text>

        <View style={{ marginTop: 36 }}>
          <Icon name="search" size={28} color={UC.ink} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Rechercher..."
            placeholderTextColor={UC.muted}
            style={s.input}
          />
        </View>

        <Pressable style={s.row} onPress={() => setPeriod(cycle(period, ["Aujourd'hui", '7 derniers jours', 'Ce mois-ci']))}>
          <Icon name="calendar" size={28} color={UC.ink} />
          <View style={s.rowLine}>
            <Text style={s.rowText}>{period ?? 'Sélectionner une date'}</Text>
            <Icon name="chevron-right" size={22} color={UC.ink} />
          </View>
        </Pressable>

        <Pressable style={s.row} onPress={() => setAmount(cycle(amount, ['< 10 000 XAF', '10 000 - 100 000 XAF', '> 100 000 XAF']))}>
          <Icon name="payments" size={28} color={UC.ink} />
          <View style={s.rowLine}>
            <Text style={s.rowText}>{amount ?? 'Sélectionner un montant'}</Text>
            <Icon name="chevron-right" size={22} color={UC.ink} />
          </View>
        </Pressable>
      </View>
      <View style={s.footer}>
        <PrimaryButton
          label="Confirmer"
          disabled={!q && !period && !amount}
          onPress={() => router.replace({ pathname: '/(client)/(tabs)/history', params: q ? { q } : {} })}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bgGrey },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  help: { width: 26, height: 26, borderRadius: 13, backgroundColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: UC.white, fontSize: 16, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: 16 },
  title: { fontFamily: ucFont.condensed, fontSize: 28, fontWeight: '700', color: UC.ink, marginTop: 24 },
  input: { fontFamily: ucFont.condensed, fontSize: 21, fontWeight: '700', color: UC.ink, borderBottomWidth: 1, borderBottomColor: UC.line, paddingVertical: 6, marginTop: 8 },
  row: { marginTop: 36, gap: 8 },
  rowLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { fontFamily: ucFont.condensed, fontSize: 19, fontWeight: '700', color: UC.inkSoft },
  footer: { paddingHorizontal: 16, paddingBottom: 12 },
});
