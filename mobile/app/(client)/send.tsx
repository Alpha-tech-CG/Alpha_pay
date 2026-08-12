import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, Image, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet, type Contact } from '@/wallet-store';

export default function SendMoney() {
  const router = useRouter();
  const { contacts, balanceCents, sendMoney } = useWallet();
  const [selected, setSelected] = useState<Contact | null>(contacts[0] ?? null);
  const [amount, setAmount] = useState('10000');

  const amountCents = Math.round((parseFloat(amount) || 0) * 100);
  const network = selected?.network ?? 'mtn';
  const canSend = !!selected && amountCents > 0 && amountCents <= balanceCents;

  const review = () => {
    if (!selected) { Alert.alert('Destinataire', 'Choisissez un destinataire.'); return; }
    if (amountCents <= 0) { Alert.alert('Montant', 'Entrez un montant valide.'); return; }
    if (amountCents > balanceCents) { Alert.alert('Solde insuffisant', 'Votre solde ne couvre pas ce transfert.'); return; }
    Alert.alert(
      'Confirmer le transfert',
      `Envoyer ${formatXAF(amountCents)} XAF à ${selected.name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: () => { sendMoney(selected, amountCents); router.back(); },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.back} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={AP.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>Send Money</Text>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.sectionLabel}>RECIPIENT</Text>
          <View style={s.searchWrap}>
            <Icon name="search" size={18} color={AP.mutedForeground} style={s.searchIcon} />
            <TextInput placeholder="Name, phone or @tag" placeholderTextColor={AP.mutedForeground} style={s.search} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.contacts}>
            <Pressable style={s.contact}>
              <View style={s.contactNew}><Icon name="plus" size={20} color={AP.foreground} /></View>
              <Text style={s.contactName}>New</Text>
            </Pressable>
            {contacts.map((c) => {
              const active = selected?.id === c.id;
              return (
                <Pressable key={c.id} style={s.contact} onPress={() => setSelected(c)}>
                  {c.avatar ? (
                    <Image source={{ uri: c.avatar }} style={[s.contactAvatar, active && s.contactActive]} />
                  ) : (
                    <View style={[s.contactInitials, active && s.contactActive]}>
                      <Text style={s.contactInitialsText}>{c.initials}</Text>
                    </View>
                  )}
                  <Text style={s.contactName}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[s.sectionLabel, { marginTop: 32 }]}>AMOUNT</Text>
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
            <View style={s.balanceChip}>
              <Text style={s.balanceChipText}>Balance: {formatXAF(balanceCents)} XAF</Text>
            </View>
          </View>

          <View style={s.networkBanner}>
            <View style={s.networkLeft}>
              <View style={[s.networkBadge, { backgroundColor: network === 'mtn' ? AP.mtn : AP.airtel }]}>
                <Text style={[s.networkBadgeText, { color: network === 'mtn' ? '#000' : '#fff' }]}>{network === 'mtn' ? 'MTN' : 'Airtel'}</Text>
              </View>
              <View>
                <Text style={s.networkTitle}>{network === 'mtn' ? 'MTN Mobile Money' : 'Airtel Money'} detected</Text>
                <Text style={s.networkFee}>Fee: 100 XAF</Text>
              </View>
            </View>
            <Icon name="check-circle" size={20} color={AP.primary} />
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable style={[s.cta, !canSend && s.ctaDisabled, shadow(8, AP.primary, 0.2)]} onPress={review} disabled={!canSend}>
            <Text style={s.ctaText}>Review Transfer</Text>
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
  searchWrap: { marginBottom: 16 },
  searchIcon: { position: 'absolute', left: 16, top: 17, zIndex: 1 },
  search: { height: 56, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, paddingLeft: 44, paddingRight: 16, color: AP.foreground, fontSize: 15 },

  contacts: { gap: 16, paddingRight: 8 },
  contact: { alignItems: 'center', gap: 8, width: 70 },
  contactNew: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: AP.muted, alignItems: 'center', justifyContent: 'center' },
  contactAvatar: { width: 56, height: 56, borderRadius: radius.full },
  contactInitials: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: AP.secondary, alignItems: 'center', justifyContent: 'center' },
  contactInitialsText: { color: '#fff', fontWeight: '700' },
  contactActive: { borderWidth: 2, borderColor: AP.primary },
  contactName: { fontSize: 10, fontWeight: '500', color: AP.foreground, textAlign: 'center' },

  amountCard: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, padding: 32, alignItems: 'center', gap: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountCurrency: { fontSize: 22, fontWeight: '700', color: AP.mutedForeground },
  amountInput: { fontSize: 44, fontWeight: '800', color: AP.foreground, minWidth: 120, textAlign: 'center', fontVariant: ['tabular-nums'], padding: 0 },
  balanceChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: soft.muted50, borderRadius: radius.full, borderWidth: 1, borderColor: AP.border },
  balanceChipText: { fontSize: 12, fontWeight: '500', color: AP.foreground },

  networkBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, padding: 16, backgroundColor: soft.primary05, borderWidth: 1, borderColor: soft.primary20, borderRadius: radius.xl },
  networkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  networkBadge: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  networkBadgeText: { fontSize: 10, fontWeight: '800' },
  networkTitle: { fontSize: 12, fontWeight: '600', color: AP.foreground },
  networkFee: { fontSize: 10, color: AP.mutedForeground },

  footer: { paddingHorizontal: 20, paddingTop: 8 },
  cta: { height: 56, backgroundColor: AP.primary, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: 16, fontWeight: '700', color: AP.primaryForeground },
});
