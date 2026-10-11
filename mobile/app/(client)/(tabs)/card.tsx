import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Amount, AvatarBadge, BigTitle, Divider, TxLine, Wordmark, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet, type Transaction } from '@/wallet-store';

const GROUP_FR: Record<string, string> = { Today: "Aujourd'hui", Yesterday: 'Hier' };

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/* Carte noire « éclaboussure » de couleurs — reproduit l'esprit de la Genius Card. */
function CardArt({ width, holder, last4, expiry, frozen }: { width: number; holder: string; last4: string; expiry: string; frozen: boolean }) {
  const h = width / 1.6;
  const blob = (c: string, l: number, t: number, w: number, hh: number, r: number, o = 0.85) => (
    <View style={{ position: 'absolute', left: l * width, top: t * h, width: w * width, height: hh * h, borderRadius: 999, backgroundColor: c, opacity: o, transform: [{ rotate: `${r}deg` }] }} />
  );
  return (
    <View style={[s.cardArt, { width, height: h }]}>
      {blob('#1FA2FF', 0.38, 0.28, 0.42, 0.22, -18, 0.75)}
      {blob('#12D18E', 0.30, 0.38, 0.30, 0.16, 12, 0.8)}
      {blob('#FF3D57', 0.16, 0.52, 0.30, 0.12, -28, 0.8)}
      {blob('#FFB800', 0.58, 0.20, 0.18, 0.14, 30, 0.7)}
      {blob('#7B2FF7', 0.62, 0.44, 0.26, 0.12, -8, 0.6)}
      {blob('#00E5FF', 0.48, 0.52, 0.16, 0.08, 40, 0.7)}

      <View style={{ padding: 11, flex: 1, justifyContent: 'space-between' }}>
        <View>
          <Text style={s.cardBrand}>Alpha Card</Text>
          <Wordmark size={11} />
        </View>
        <View style={s.cardMid}>
          <Text style={s.prepaid} numberOfLines={1}>Prépayée</Text>
          <View style={s.chip} />
          <View style={{ flex: 1 }} />
          <Icon name="contactless" size={20} color={UC.white} />
        </View>
        <Text style={s.cardNumber}>****  ****  ****  {last4}</Text>
        <View style={s.cardBottom}>
          <View>
            <Text style={s.cardExpiry}>{expiry}</Text>
            <Text style={s.cardHolder} numberOfLines={1}>{holder.toUpperCase()}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row' }}>
              <View style={[s.mc, { backgroundColor: '#EB001B' }]} />
              <View style={[s.mc, { backgroundColor: '#F79E1B', marginLeft: -9, opacity: 0.9 }]} />
            </View>
            <Text style={s.mcText}>mastercard</Text>
          </View>
        </View>
      </View>
      {frozen && (
        <View style={s.frozen}>
          <Icon name="snowflake" size={26} color={UC.white} />
          <Text style={s.frozenText}>CARTE SUSPENDUE</Text>
        </View>
      )}
    </View>
  );
}

function Action({ icon, label, onPress, dim }: { icon: string; label: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Icon name={icon} size={24} color={dim ? '#9A9A9A' : UC.ink} />
      <Text style={[s.actionLabel, dim && { color: '#9A9A9A' }]}>{label}</Text>
    </Pressable>
  );
}

export default function CardScreen() {
  const router = useRouter();
  useStatusBar('light');
  const { width } = useWindowDimensions();
  const { card, user, balanceCents, currency, transactions } = useWallet();

  const pending = transactions.find((t) => t.status === 'pending');
  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    transactions.filter((t) => t !== pending).forEach((t) => {
      const key = GROUP_FR[t.group] ?? t.group;
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()];
  }, [transactions, pending]);

  return (
    <View style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Bandeau sombre */}
        <SafeAreaView edges={['top']} style={s.dark}>
          <View style={s.header}>
            <BigTitle color={UC.white}>Cartes</BigTitle>
            <AvatarBadge uri={user.avatar} count={3} onPress={() => router.push('/(client)/profile')} />
          </View>

          <View style={s.cardRow}>
            <CardArt width={width * 0.6} holder={card.holder} last4={card.number.slice(-4)} expiry={card.expiry} frozen={card.frozen} />
            <View style={s.ghost}>
              <Text style={s.ghostTitle}>Toutes les cartes</Text>
              <Text style={s.ghostSub}>Cartes pour tous vos besoins</Text>
            </View>
          </View>

          <View style={s.balance}>
            <View style={s.balanceHead}>
              <Text style={s.balanceLabel}>Solde disponible</Text>
              <Icon name="info" size={18} color={UC.white} />
            </View>
            <Amount cents={balanceCents} currency={currency} size={26} color={UC.white} />
            <Text style={s.balanceSub}>Solde comptable au {todayStr()}</Text>
            <Pressable style={s.iban} onPress={() => router.push('/(client)/receive')}>
              <Text style={s.ibanText}>Voir les détails de votre compte</Text>
              <Icon name="chevron-right" size={18} color={UC.teal} />
            </Pressable>
          </View>

          <View style={s.dots}>
            <View style={s.dotActive} />
            <View style={s.dot} />
            <View style={s.dot} />
          </View>
        </SafeAreaView>

        {/* Panneau d'actions qui chevauche le bandeau */}
        <View style={s.actions}>
          <Action icon="payments" label="Virement" onPress={() => router.push('/(client)/send')} />
          <Action icon="alert-triangle" label={'Problème\ncarte'} onPress={() => router.push('/(client)/card-problem')} />
          <Action icon="search" label={'Recherche\nmouvements'} onPress={() => router.push('/(client)/search-filters')} />
          <Action icon="settings" label="Gestion carte" onPress={() => router.push('/(client)/card-manage')} />
        </View>

        <View style={s.list}>
          {pending && (
            <View style={s.pending}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.pendingTitle}>{pending.title}</Text>
                <Text style={s.pendingSub}>{pending.subtitle}</Text>
                <View style={s.tag}><Text style={s.tagText}>À COMPTABILISER</Text></View>
              </View>
              <Amount cents={pending.amountCents} signed size={22} />
            </View>
          )}
          {sections.map(([title, items]) => (
            <View key={title}>
              <Divider />
              <Text style={s.groupTitle}>{title}</Text>
              {items.map((tx, i) => <TxLine key={tx.id} tx={tx} last={i === items.length - 1} />)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bgGrey },
  dark: { backgroundColor: UC.dark, paddingBottom: 62 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },

  cardRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  cardArt: { backgroundColor: '#050505', borderRadius: 9, overflow: 'hidden' },
  cardBrand: { fontFamily: ucFont.condensed, fontSize: 17, fontWeight: '700', color: UC.white, marginBottom: 2 },
  cardMid: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prepaid: { fontSize: 8, fontWeight: '700', color: UC.white, transform: [{ rotate: '-90deg' }], width: 48, marginHorizontal: -16, textAlign: 'center' },
  chip: { width: 26, height: 20, borderRadius: 4, backgroundColor: '#D9D9D9' },
  cardNumber: { fontFamily: ucFont.regular, fontSize: 13, color: UC.white, letterSpacing: 1.5, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  cardExpiry: { fontFamily: ucFont.regular, fontSize: 11, color: UC.white, marginLeft: 60 },
  cardHolder: { fontFamily: ucFont.regular, fontSize: 11, color: UC.white, maxWidth: 130 },
  mc: { width: 20, height: 20, borderRadius: 10 },
  mcText: { fontSize: 6, color: UC.white, marginTop: 1 },
  frozen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  frozenText: { fontFamily: ucFont.condensed, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: UC.white },

  ghost: { width: 200, paddingLeft: 22, opacity: 0.45 },
  ghostTitle: { fontFamily: ucFont.condensed, fontSize: 20, fontWeight: '700', color: '#BDBDBD' },
  ghostSub: { fontFamily: ucFont.regular, fontSize: 12, color: '#BDBDBD', marginTop: 6 },

  balance: { paddingHorizontal: 14, paddingTop: 14, gap: 3 },
  balanceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceLabel: { fontFamily: ucFont.condensed, fontSize: 17, fontWeight: '700', color: UC.white },
  balanceSub: { fontFamily: ucFont.regular, fontSize: 14, color: UC.white },
  iban: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ibanText: { fontFamily: ucFont.regular, fontSize: 14, color: UC.white },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8A8A8A' },
  dotActive: { width: 26, height: 8, borderRadius: 4, backgroundColor: UC.white },

  actions: { flexDirection: 'row', backgroundColor: UC.white, marginHorizontal: 14, marginTop: -38, borderRadius: 4, paddingVertical: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionLabel: { fontFamily: ucFont.regular, fontSize: 14, color: UC.ink, textAlign: 'center' },

  list: { paddingHorizontal: 18, paddingTop: 14 },
  pending: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 18 },
  pendingTitle: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },
  pendingSub: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted },
  tag: { alignSelf: 'flex-start', backgroundColor: UC.teal, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  tagText: { fontFamily: ucFont.condensed, fontSize: 14, fontWeight: '700', color: UC.white },
  groupTitle: { fontFamily: ucFont.condensed, fontSize: 19, fontWeight: '700', color: UC.teal, paddingTop: 18 },
});
