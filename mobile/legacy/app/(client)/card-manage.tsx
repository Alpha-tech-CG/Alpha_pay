import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Divider, LinkAction, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

// « Gestion carte » : feuille modale, lignes LIBELLÉ / actions teal.
function Line({ label, value, children, last }: { label: string; value?: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <>
      <View style={s.line}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.label}>{label}</Text>
          {value && <Text style={s.value}>{value}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 14 }}>{children}</View>
      </View>
      {!last && <Divider style={{ backgroundColor: UC.ink, opacity: 0.6 }} />}
    </>
  );
}

export default function CardManage() {
  const router = useRouter();
  useStatusBar('dark');
  const { card, toggleFreeze, toggleCardSetting } = useWallet();
  const soon = (what: string) => Alert.alert(what, 'Disponible prochainement.');

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <Stack.Screen options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <View style={s.top}>
        <View style={{ width: 26 }} />
        <Icon name="chevron-down" size={28} color={UC.ink} onPress={() => router.back()} />
        <View style={s.help}><Text style={s.helpText}>?</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Gestion carte</Text>
        <Text style={s.subtitle}>Carte AlphaPay Prépayée</Text>

        <View style={{ marginTop: 24 }}>
          <Line label="INFOS CARTE"><LinkAction label="Afficher" onPress={() => soon('Infos carte')} /></Line>
          <Line label="AFFICHER LE PIN"><LinkAction label="Afficher" onPress={() => soon('Code PIN')} /></Line>
          <Line label="PLAFONDS"><LinkAction label="Modifier" onPress={() => soon('Plafonds')} /></Line>
          <Line label="STATUT" value={card.frozen ? 'CARTE SUSPENDUE' : 'CARTE ACTIVE'}>
            <LinkAction label="Gérer" onPress={() => router.push('/(client)/card-problem')} />
            <LinkAction label={card.frozen ? 'Réactiver' : 'Suspendre'} onPress={toggleFreeze} />
            <LinkAction label="Demander un duplicata" onPress={() => soon('Duplicata')} />
          </Line>
          <View style={[s.line, { paddingBottom: 6 }]}>
            <View style={{ gap: 4 }}>
              <Text style={s.label}>SUPPORT</Text>
              <Text style={[s.value, { fontSize: 13 }]}>VIRTUEL</Text>
            </View>
          </View>
          <Line label="3D SECURE">
            <Pressable onPress={() => toggleCardSetting('secure3d')}><Text style={s.state}>{card.secure3d ? 'ACTIF' : 'INACTIF'}</Text></Pressable>
          </Line>
          <Line label="PAIEMENTS EN LIGNE">
            <Pressable onPress={() => toggleCardSetting('onlinePayments')}><Text style={s.state}>{card.onlinePayments ? 'ACTIF' : 'INACTIF'}</Text></Pressable>
          </Line>
          <Line label="RELEVÉ DE COMPTE" value="ATTESTATION DE SOLDE"><LinkAction label="Demander" onPress={() => soon('Attestation')} /></Line>
          <Line label="TIRELIRE" last><LinkAction label="Gérer" onPress={() => soon('Tirelire')} /></Line>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  help: { width: 26, height: 26, borderRadius: 13, backgroundColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: UC.white, fontSize: 16, fontWeight: '900' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { fontFamily: ucFont.condensed, fontSize: 28, fontWeight: '700', color: UC.ink, marginTop: 12 },
  subtitle: { fontFamily: ucFont.regular, fontSize: 16, color: UC.ink, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 18, paddingHorizontal: 4 },
  label: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', color: UC.inkSoft, letterSpacing: 0.5 },
  value: { fontFamily: ucFont.condensed, fontSize: 15, color: UC.ink },
  state: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', color: UC.ink },
});
