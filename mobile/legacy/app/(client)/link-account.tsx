import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/components/Icon';
import { BigTitle, BrandTile, Label, PrimaryButton, Radio, TopBar, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';

type Option = { id: string; name: string; tag: string; brand: 'mtn' | 'airtel' | 'bank'; initials?: string };

const OPERATORS: Option[] = [
  { id: 'mtn', name: 'MTN MoMo', tag: 'Mobile Money', brand: 'mtn' },
  { id: 'airtel', name: 'Airtel Money', tag: 'Mobile Money', brand: 'airtel' },
];
const BANKS: Option[] = [
  { id: 'bgfi', name: 'BGFIBank', tag: 'Congo', brand: 'bank', initials: 'BG' },
  { id: 'uba', name: 'UBA', tag: 'Congo', brand: 'bank', initials: 'UB' },
  { id: 'ecobank', name: 'Ecobank', tag: 'CEMAC', brand: 'bank', initials: 'EC' },
  { id: 'sahara', name: 'Sahara Bank', tag: 'Libye', brand: 'bank', initials: 'SB' },
  { id: 'jumhouria', name: 'Jumhouria Bank', tag: 'Libye', brand: 'bank', initials: 'JB' },
];

export default function LinkAccount() {
  useStatusBar('dark');
  const [selected, setSelected] = useState('mtn');

  const Row = ({ o }: { o: Option }) => (
    <Pressable onPress={() => setSelected(o.id)} style={s.row}>
      <Radio on={selected === o.id} />
      <BrandTile brand={o.brand} label={o.initials} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{o.name}</Text>
        <Text style={s.tag}>{o.tag}</Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <TopBar onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <BigTitle style={{ marginTop: 12 }}>Compte préféré</BigTitle>
        <Text style={s.intro}>Choisissez le compte qui finance vos paiements AlphaPay. Modifiable à tout moment.</Text>

        <Label style={s.section}>Mobile Money</Label>
        {OPERATORS.map((o) => <Row key={o.id} o={o} />)}

        <Label style={s.section}>Banque de votre choix</Label>
        {BANKS.map((b) => <Row key={b.id} o={b} />)}

        <View style={s.info}>
          <Icon name="verified-user" size={20} color={UC.teal} />
          <Text style={s.infoText}>AlphaPay ne détient jamais votre argent : il se connecte au compte choisi et ne déplace des fonds qu'avec votre accord.</Text>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <PrimaryButton label="Définir comme préféré" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  intro: { fontFamily: ucFont.regular, fontSize: 16, color: UC.inkSoft, marginTop: 6 },
  section: { marginTop: 26, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UC.lineSoft },
  name: { fontFamily: ucFont.condensed, fontSize: 18, fontWeight: '700', color: UC.ink },
  tag: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted, marginTop: 2 },
  info: { flexDirection: 'row', gap: 12, backgroundColor: UC.bgGrey, borderRadius: 8, padding: 16, marginTop: 24 },
  infoText: { flex: 1, fontFamily: ucFont.regular, fontSize: 14, color: UC.inkSoft, lineHeight: 20 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
});
