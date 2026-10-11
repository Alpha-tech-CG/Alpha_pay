import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { PrimaryButton, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

const OPTIONS = [
  { id: 'suspend', title: 'Je veux suspendre temporairement la carte', sub: 'Suspendez la carte pour la rendre temporairement inutilisable. Vous pouvez la réactiver quand vous voulez.' },
  { id: 'lost', title: "J'ai perdu ma carte", sub: 'Bloquez la carte définitivement* pour que personne ne puisse plus l\'utiliser.' },
  { id: 'stolen', title: 'On m\'a volé ma carte', sub: 'Bloquez la carte définitivement* pour empêcher le voleur de l\'utiliser.' },
  { id: 'fraud', title: "Quelqu'un utilise ma carte", sub: 'Si vous craignez qu\'un inconnu utilise votre carte, bloquez-la définitivement* pour que personne ne l\'utilise plus.' },
  { id: 'broken', title: 'La carte ne fonctionne pas', sub: 'Demandez une nouvelle carte identique à la vôtre.' },
] as const;

export default function CardProblem() {
  const router = useRouter();
  useStatusBar('dark');
  const { card, toggleFreeze } = useWallet();
  const [choice, setChoice] = useState<string | null>(null);

  const confirm = () => {
    if (choice === 'suspend' || choice === 'lost' || choice === 'stolen' || choice === 'fraud') {
      if (!card.frozen) toggleFreeze();
      Alert.alert('Carte bloquée', choice === 'suspend' ? 'Votre carte est suspendue. Réactivez-la depuis Gestion carte.' : 'Votre carte est bloquée. Notre équipe vous contactera pour une nouvelle carte.');
    } else {
      Alert.alert('Demande envoyée', 'Une nouvelle carte virtuelle va être émise.');
    }
    router.back();
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.top}>
        <View style={s.help}><Text style={s.helpText}>?</Text></View>
        <Icon name="x" size={28} color={UC.ink} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Dites-nous comment{'\n'}nous pouvons vous aider</Text>
        <View style={{ gap: 18, marginTop: 26 }}>
          {OPTIONS.map((o) => {
            const on = choice === o.id;
            return (
              <Pressable key={o.id} style={s.opt} onPress={() => setChoice(o.id)}>
                <View style={[s.radio, on && { borderColor: UC.teal }]}>{on && <View style={s.radioDot} />}</View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.optTitle}>{o.title}</Text>
                  <Text style={s.optSub}>{o.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.note}>*Vous pouvez demander en même temps l'émission d'une nouvelle carte virtuelle, disponible immédiatement.</Text>
      </ScrollView>
      <View style={s.footer}>
        <PrimaryButton label="Confirmer" disabled={!choice} onPress={confirm} />
        <PrimaryButton label="Appeler" variant="dark" icon="phone-call" onPress={() => Linking.openURL('tel:+242066000000')} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 30, paddingHorizontal: 16, paddingTop: 12 },
  help: { width: 26, height: 26, borderRadius: 13, backgroundColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: UC.white, fontSize: 16, fontWeight: '900' },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  title: { fontFamily: ucFont.condensed, fontSize: 26, fontWeight: '700', color: UC.ink, marginTop: 24, lineHeight: 32 },
  opt: { flexDirection: 'row', gap: 10 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: UC.ink, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: UC.teal },
  optTitle: { fontFamily: ucFont.condensed, fontSize: 17, fontWeight: '700', color: UC.ink },
  optSub: { fontFamily: ucFont.regular, fontSize: 13, color: UC.inkSoft },
  note: { fontFamily: ucFont.regular, fontSize: 14, color: UC.inkSoft, marginTop: 30 },
  footer: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
});
