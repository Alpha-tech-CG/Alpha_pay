import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { BigTitle, TopBar, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';

// Simulation du menu USSD (*242#) : rendu « boîte de dialogue système »
// telle qu'elle apparaît sur un téléphone sans connexion internet.
const MENU = [
  '1. Envoyer de l\'argent',
  '2. Retirer des espèces',
  '3. Carte virtuelle',
  '4. Mon compte',
  '5. Aide',
];

export default function Ussd() {
  const router = useRouter();
  useStatusBar('dark');
  const [entry, setEntry] = useState('');

  const send = () => {
    const choice = MENU.find((m) => m.startsWith(`${entry.trim()}.`));
    if (!entry.trim() || !choice) return Alert.alert('Choix invalide', 'Entrez un numéro du menu (1 à 5).');
    Alert.alert('USSD', `Sélection : ${choice.replace(/^\d+\.\s*/, '')}`);
    setEntry('');
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar onBack={() => router.back()} />
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BigTitle style={{ marginTop: 12 }}>AlphaPay sans internet</BigTitle>
          <Text style={s.sub}>
            Composez <Text style={s.code}>*242#</Text> depuis n'importe quel téléphone, même sans smartphone ni données mobiles.
          </Text>

          <View style={s.dialogWrap}>
            <View style={s.dialog}>
              <Text style={s.dialogTitle}>AlphaPay</Text>
              {MENU.map((m) => <Text key={m} style={s.item}>{m}</Text>)}
              <TextInput
                style={s.input}
                value={entry}
                onChangeText={setEntry}
                keyboardType="number-pad"
                maxLength={1}
                placeholder="Votre choix"
                placeholderTextColor={UC.muted}
                cursorColor={UC.teal}
              />
              <View style={s.actions}>
                <Pressable onPress={() => router.back()} hitSlop={8}><Text style={s.action}>ANNULER</Text></Pressable>
                <Pressable onPress={send} hitSlop={8}><Text style={s.action}>ENVOYER</Text></Pressable>
              </View>
            </View>
          </View>

          <View style={s.note}>
            <Icon name="info" size={18} color={UC.inkSoft} />
            <Text style={s.noteText}>Le canal USSD garantit l'accès aux services financiers aux 60 % de la population non bancarisée.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bgGrey },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  sub: { fontFamily: ucFont.regular, fontSize: 16, color: UC.inkSoft, marginTop: 6 },
  code: { fontFamily: ucFont.condensed, fontWeight: '700', color: UC.teal },
  dialogWrap: { marginVertical: 28 },
  dialog: { backgroundColor: UC.white, borderRadius: 8, padding: 22, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  dialogTitle: { fontFamily: ucFont.condensed, fontSize: 21, fontWeight: '700', color: UC.ink, marginBottom: 10 },
  item: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink, lineHeight: 27 },
  input: { fontFamily: ucFont.condensed, fontSize: 20, color: UC.ink, borderBottomWidth: 2, borderBottomColor: UC.teal, paddingVertical: 6, marginTop: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 32, marginTop: 22 },
  action: { fontFamily: ucFont.condensed, fontSize: 16, fontWeight: '700', color: UC.teal, letterSpacing: 0.4 },
  note: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: UC.line, paddingVertical: 16 },
  noteText: { flex: 1, fontFamily: ucFont.regular, fontSize: 14, color: UC.inkSoft, lineHeight: 19 },
});
