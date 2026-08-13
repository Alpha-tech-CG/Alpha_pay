import { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet, type Contact } from '@/wallet-store';

function ContactChip({ contact, selected, onPress }: { contact: Contact; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={s.contact} onPress={onPress}>
      <View>
        {contact.avatar ? (
          <Image source={{ uri: contact.avatar }} style={[s.contactAvatar, selected && s.contactSel]} />
        ) : (
          <View style={[s.contactAvatar, s.contactInitials, selected && s.contactSel]}>
            <Text style={s.contactInitialsText}>{contact.initials}</Text>
          </View>
        )}
        {selected && (
          <View style={s.contactCheck}>
            <Icon name="check-circle" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={s.contactName} numberOfLines={1}>{contact.name}</Text>
    </Pressable>
  );
}

export default function Send() {
  const router = useRouter();
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
    if (!selected) return Alert.alert('Recipient', 'Please choose a recipient first.');
    if (amountCents <= 0) return Alert.alert('Amount', 'Enter an amount greater than zero.');
    if (amountCents > balanceCents) return Alert.alert('Insufficient balance', 'You do not have enough funds.');
    sendMoney(selected, amountCents);
    Alert.alert('Sent', `${formatXAF(amountCents)} XAF sent to ${selected.name}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={AP.secondary} />
        </Pressable>
        <Text style={s.title}>Send Money</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Recipient */}
        <View style={s.sectionHead}>
          <Text style={s.sectionLabel}>Recipient</Text>
          <Text style={s.sectionAction}>Phone Contacts</Text>
        </View>
        <View style={s.searchBox}>
          <Icon name="search" size={20} color="rgba(11,30,61,0.3)" />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Name, phone or @tag"
            placeholderTextColor="rgba(11,30,61,0.35)"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.contactsRow}>
          <Pressable style={s.contact}>
            <View style={[s.contactAvatar, s.contactNew]}>
              <Icon name="add-circle" size={30} color={AP.primary} />
            </View>
            <Text style={[s.contactName, { color: 'rgba(11,30,61,0.4)' }]}>New</Text>
          </Pressable>
          {filtered.map((c) => (
            <ContactChip key={c.id} contact={c} selected={c.id === selectedId} onPress={() => setSelectedId(c.id)} />
          ))}
        </ScrollView>

        {/* Amount */}
        <Text style={[s.sectionLabel, { marginTop: 28, marginBottom: 16 }]}>Amount</Text>
        <View style={s.amountCard}>
          <View style={s.glow} />
          <Text style={s.amountCurrency}>CONGO {amountCents ? 'XAF' : 'XAF'}</Text>
          <TextInput
            style={s.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.1)"
          />
          <View style={s.availChip}>
            <Text style={s.availText}>Available: <Text style={s.availValue}>{formatXAF(balanceCents)}</Text></Text>
          </View>
        </View>

        {/* Network / fee */}
        <View style={s.feeCard}>
          <View style={s.feeLeft}>
            <View style={s.mtnTile}>
              <Text style={s.mtnText}>MTN</Text>
            </View>
            <View>
              <Text style={s.feeTitle}>{network} Transfer</Text>
              <Text style={s.feeSub}>Network Fee: 100 XAF</Text>
            </View>
          </View>
          <View style={s.feeCheck}>
            <Icon name="check-circle" size={20} color={AP.chart3} />
          </View>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={({ pressed }) => [s.cta, pressed && s.pressed]} onPress={onSend}>
          <Text style={s.ctaText}>Review & Send</Text>
          <Icon name="arrow-up-right" size={22} color={AP.secondary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  pressed: { opacity: 0.95, transform: [{ scale: 0.98 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 48, height: 48, borderRadius: radius.xl, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  title: { fontSize: 20, fontWeight: '700', color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase' },
  sectionAction: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: AP.primary, textTransform: 'uppercase' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 64, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, paddingHorizontal: 20, ...shadow(2) },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '700', color: AP.secondary },

  contactsRow: { gap: 20, paddingVertical: 16, paddingRight: 8 },
  contact: { alignItems: 'center', gap: 12, width: 70 },
  contactAvatar: { width: 64, height: 64, borderRadius: radius.xxl, borderWidth: 2, borderColor: '#fff', ...shadow(3) },
  contactNew: { backgroundColor: AP.card, borderStyle: 'dashed', borderColor: 'rgba(0,180,216,0.4)', alignItems: 'center', justifyContent: 'center' },
  contactInitials: { backgroundColor: AP.secondary, alignItems: 'center', justifyContent: 'center' },
  contactInitialsText: { color: AP.primary, fontWeight: '800', fontSize: 20 },
  contactSel: { borderColor: AP.primary },
  contactCheck: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: AP.chart3, borderWidth: 2, borderColor: AP.bg, alignItems: 'center', justifyContent: 'center' },
  contactName: { fontSize: 10, fontWeight: '700', color: AP.secondary, textAlign: 'center' },

  amountCard: { backgroundColor: AP.secondary, borderRadius: 40, padding: 36, alignItems: 'center', gap: 20, overflow: 'hidden', ...shadow(18, AP.secondary, 0.2) },
  glow: { position: 'absolute', top: -64, right: -64, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.05)' },
  amountCurrency: { fontSize: 10, fontWeight: '800', letterSpacing: 3, color: AP.primary, textTransform: 'uppercase' },
  amountInput: { fontSize: 56, fontWeight: '900', color: '#fff', textAlign: 'center', minWidth: 200, fontVariant: ['tabular-nums'] },
  availChip: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  availText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' },
  availValue: { color: AP.primary, fontVariant: ['tabular-nums'] },

  feeCard: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxxl, padding: 20, ...shadow(2) },
  feeLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  mtnTile: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: soft.mtn10, borderWidth: 1, borderColor: soft.mtn20, alignItems: 'center', justifyContent: 'center' },
  mtnText: { fontSize: 14, fontWeight: '900', color: AP.mtn },
  feeTitle: { fontSize: 14, fontWeight: '800', color: AP.secondary, textTransform: 'uppercase', letterSpacing: -0.2 },
  feeSub: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: AP.mutedForeground, textTransform: 'uppercase', marginTop: 2 },
  feeCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: soft.chart3_10, alignItems: 'center', justifyContent: 'center' },

  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  cta: { height: 68, backgroundColor: AP.primary, borderRadius: radius.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...shadow(12, AP.primary, 0.25) },
  ctaText: { fontSize: 18, fontWeight: '900', color: AP.secondary },
});
