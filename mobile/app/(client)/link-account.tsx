import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { router } from 'expo-router';
import { useTheme, type Palette } from '@/theme';

const OPERATORS = [
  { id: 'mtn', name: 'MTN MoMo', tag: 'Mobile Money', initials: 'MTN', tint: 'pending' as const },
  { id: 'airtel', name: 'Airtel Money', tag: 'Mobile Money', initials: 'AR', tint: 'error' as const },
];
const BANKS = [
  { id: 'bgfi', name: 'BGFIBank', tag: 'Congo 🇨🇬', initials: 'BG' },
  { id: 'uba', name: 'UBA', tag: 'Congo 🇨🇬', initials: 'UB' },
  { id: 'ecobank', name: 'Ecobank', tag: 'CEMAC', initials: 'EC' },
  { id: 'sahara', name: 'Sahara Bank', tag: 'Libye 🇱🇾', initials: 'SB' },
  { id: 'jumhouria', name: 'Jumhouria Bank', tag: 'Libye 🇱🇾', initials: 'JB' },
];

export default function LinkAccount() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [selected, setSelected] = useState('mtn');

  const tintBg = (t?: 'pending' | 'error') =>
    t === 'pending' ? C.pendingBg : t === 'error' ? C.errorContainer : C.primarySoft;
  const tintFg = (t?: 'pending' | 'error') =>
    t === 'pending' ? C.pending : t === 'error' ? C.error : C.primary;

  const Option = ({ id, name, tag, initials, tint }: { id: string; name: string; tag: string; initials: string; tint?: 'pending' | 'error' }) => {
    const active = selected === id;
    return (
      <Pressable onPress={() => setSelected(id)} style={[s.option, { borderColor: active ? C.primary : C.border }]}>
        <View style={[s.optIcon, { backgroundColor: tintBg(tint) }]}><Text style={[s.optIconTxt, { color: tintFg(tint) }]}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.optName}>{name}</Text>
          <Text style={s.optTag}>{tag}</Text>
        </View>
        <View style={[s.radio, { borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primary : 'transparent' }]}>
          {active && <Icon name="check" size={14} color={C.onPrimary} />}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.back}><Icon name="arrow-back" size={22} color={C.text} /></Pressable>
          <Text style={s.title}>Compte préféré</Text>
        </View>
        <Text style={s.intro}>Choisissez le compte qui finance vos paiements AlphaPay. Modifiable à tout moment.</Text>

        <View style={s.groupLabel}><Icon name="smartphone" size={14} color={C.muted} /><Text style={s.groupLabelTxt}>Mobile Money</Text></View>
        <View style={{ gap: 10 }}>{OPERATORS.map((o) => <Option key={o.id} {...o} />)}</View>

        <View style={[s.groupLabel, { marginTop: 22 }]}><Icon name="account-balance" size={14} color={C.muted} /><Text style={s.groupLabelTxt}>Banque de votre choix</Text></View>
        <View style={{ gap: 10 }}>{BANKS.map((b) => <Option key={b.id} {...b} />)}</View>

        <View style={s.infoBox}>
          <Icon name="verified-user" size={20} color={C.primary} />
          <Text style={s.infoTxt}>AlphaPay ne détient jamais votre argent — il se connecte au compte choisi et ne déplace des fonds qu'avec votre accord.</Text>
        </View>

        <Pressable style={s.cta} onPress={() => router.back()}><Text style={s.ctaTxt}>Définir comme préféré</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 50 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  intro: { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 20 },
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  groupLabelTxt: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1.5, borderRadius: 16, padding: 12 },
  optIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optIconTxt: { fontSize: 12, fontWeight: '800' },
  optName: { fontSize: 14, fontWeight: '700', color: C.text },
  optTag: { fontSize: 12, color: C.muted, marginTop: 1 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  infoBox: { flexDirection: 'row', gap: 12, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginTop: 22 },
  infoTxt: { flex: 1, fontSize: 12, color: C.textVariant, lineHeight: 18 },
  cta: { backgroundColor: C.primary, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  ctaTxt: { fontSize: 15, fontWeight: '700', color: C.onPrimary },
});
