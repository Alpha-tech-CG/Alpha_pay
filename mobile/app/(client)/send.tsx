import { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Amount, BigTitle, BrandTile, Divider, Label, PrimaryButton, TopBar, useStatusBar } from '@/components/UcKit';
import { UC, ucFont, splitAmount } from '@/uc';

const fmt = (cents: number) => splitAmount(cents).int;
import { useWallet, type Contact } from '@/wallet-store';

const FEE_CENTS = 10000;

function ContactChip({ contact, selected, onPress }: { contact: Contact; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={s.contact} onPress={onPress}>
      <View style={[s.ring, selected && { borderColor: UC.red }]}>
        {contact.avatar
          ? <Image source={{ uri: contact.avatar }} style={s.avatar} />
          : <View style={[s.avatar, s.initials]}><Text style={s.initialsText}>{contact.initials}</Text></View>}
      </View>
      <Text style={[s.contactName, selected && { color: UC.teal }]} numberOfLines={1}>{contact.name}</Text>
    </Pressable>
  );
}

export default function Send() {
  const router = useRouter();
  useStatusBar('dark');
  const { contacts, balanceCents, sendMoney } = useWallet();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [amount, setAmount] = useState('10000');

  const filtered = useMemo(
    () => contacts.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)),
    [contacts, query],
  );
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const amountCents = Math.round((parseFloat(amount.replace(/[^0-9.]/g, '')) || 0) * 100);
  const network = selected?.network === 'airtel' ? 'Airtel Money' : 'MTN MoMo';

  const onSend = () => {
    if (!selected) return Alert.alert('Bénéficiaire', 'Choisissez d\'abord un bénéficiaire.');
    if (amountCents <= 0) return Alert.alert('Montant', 'Saisissez un montant supérieur à zéro.');
    if (amountCents > balanceCents) return Alert.alert('Solde insuffisant', 'Vous n\'avez pas assez de fonds.');
    sendMoney(selected, amountCents);
    Alert.alert('Virement envoyé', `${fmt(amountCents)} XAF envoyés à ${selected.name}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar onBack={() => router.back()} />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <BigTitle style={s.title}>Envoyer de l'argent</BigTitle>

          {/* Bénéficiaire */}
          <Label>Bénéficiaire</Label>
          <View style={s.searchRow}>
            <Icon name="search" size={22} color={UC.ink} />
            <TextInput
              style={s.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Nom, téléphone ou @tag"
              placeholderTextColor={UC.muted}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.contacts}>
            <Pressable style={s.contact} onPress={() => Alert.alert('Nouveau bénéficiaire', 'Saisissez son numéro dans la recherche.')}>
              <View style={[s.ring, s.newRing]}>
                <Icon name="plus" size={24} color={UC.teal} />
              </View>
              <Text style={[s.contactName, { color: UC.teal }]}>Nouveau</Text>
            </Pressable>
            {filtered.map((c) => (
              <ContactChip key={c.id} contact={c} selected={c.id === selectedId} onPress={() => setSelectedId(c.id)} />
            ))}
          </ScrollView>
          <Divider />

          {/* Montant */}
          <Label style={{ marginTop: 22 }}>Montant</Label>
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
          <View style={s.availRow}>
            <Text style={s.availLabel}>Solde disponible</Text>
            <Amount cents={balanceCents} size={17} color={UC.ink} />
          </View>

          {/* Réseau & frais */}
          <View style={s.netRow}>
            <BrandTile brand={selected?.network ?? 'mtn'} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={s.netTitle}>Transfert {network}</Text>
              <Text style={s.netSub}>{selected ? selected.phone : '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Label>Frais</Label>
              <Text style={s.fee}>{fmt(FEE_CENTS)} XAF</Text>
            </View>
          </View>
          <Divider />
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total débité</Text>
            <Amount cents={amountCents + (amountCents ? FEE_CENTS : 0)} size={24} />
          </View>
        </ScrollView>

        <View style={s.footer}>
          <PrimaryButton label="Vérifier et envoyer" disabled={!selected || amountCents <= 0} onPress={onSend} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  title: { marginTop: 12, marginBottom: 24 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: UC.line, marginTop: 6 },
  search: { flex: 1, fontFamily: ucFont.condensed, fontSize: 19, color: UC.ink, paddingVertical: 8 },

  contacts: { gap: 16, paddingVertical: 18 },
  contact: { alignItems: 'center', gap: 6, width: 64 },
  ring: { width: 58, height: 58, borderRadius: 29, borderWidth: 2.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  newRing: { borderColor: UC.teal, borderStyle: 'dashed' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: UC.lineSoft },
  initials: { backgroundColor: UC.dark, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: ucFont.condensed, color: UC.white, fontWeight: '700', fontSize: 17 },
  contactName: { fontFamily: ucFont.regular, fontSize: 13, color: UC.ink, textAlign: 'center' },

  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1, borderBottomColor: UC.line },
  amountInput: { flex: 1, fontFamily: ucFont.condensed, fontSize: 42, fontWeight: '700', color: UC.ink, paddingVertical: 4 },
  amountCur: { fontFamily: ucFont.regular, fontSize: 22, color: UC.inkSoft, marginBottom: 12 },
  availRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  availLabel: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted },

  netRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, paddingVertical: 14 },
  netTitle: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },
  netSub: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted, marginTop: 2 },
  fee: { fontFamily: ucFont.condensed, fontSize: 16, fontWeight: '700', color: UC.ink, marginTop: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  totalLabel: { fontFamily: ucFont.condensed, fontSize: 19, fontWeight: '700', color: UC.ink },

  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
});
