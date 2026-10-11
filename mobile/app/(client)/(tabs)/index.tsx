import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Amount, AvatarBadge, BigTitle, Divider, TxLine, useAmountsHidden, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

type Tile = { key: string; title: string; bg: string; fg: string; icon: string; cents?: number; onPress?: () => void };

export default function Home() {
  const router = useRouter();
  useStatusBar('dark');
  const { width } = useWindowDimensions();
  const { user, balanceCents, currency, transactions, card } = useWallet();
  const [hidden, toggleHidden] = useAmountsHidden();
  const [page, setPage] = useState(0);
  const recent = useMemo(() => transactions.slice(0, 5), [transactions]);
  const spent = useMemo(
    () => transactions.filter((t) => t.direction === 'out' && t.status !== 'failed').reduce((a, t) => a + Math.abs(t.amountCents), 0),
    [transactions],
  );

  const tileW = width - 32;
  const tiles: Tile[] = [
    { key: 'worth', title: 'Voici la valeur de\nvotre patrimoine', bg: UC.slate, fg: UC.ink, icon: 'account-balance', cents: balanceCents },
    { key: 'spent', title: 'Combien avez-vous\ndépensé ce mois-ci ?', bg: UC.taupe, fg: UC.white, icon: 'shopping-bag', cents: -spent, onPress: () => router.push('/(client)/(tabs)/history') },
    { key: 'send', title: 'Envoyez de l\'argent\nen un instant', bg: UC.sage, fg: UC.white, icon: 'send', onPress: () => router.push('/(client)/send') },
    { key: 'topup', title: 'Rechargez avec\nMTN ou Airtel', bg: UC.sand, fg: UC.ink, icon: 'smartphone', onPress: () => router.push('/(client)/top-up') },
  ];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / (tileW + 10)));
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* En-tête */}
        <View style={s.header}>
          <BigTitle>Accueil</BigTitle>
          <View style={s.headerRight}>
            <Pressable onPress={toggleHidden} style={s.eyeBtn} hitSlop={8}>
              <Icon name={hidden ? 'eye-off' : 'eye'} size={15} color={UC.white} />
            </Pressable>
            <Icon name="settings" size={24} color={UC.ink} onPress={() => router.push('/(client)/(tabs)/settings')} />
            <AvatarBadge uri={user.avatar} count={recent.length} onPress={() => router.push('/(client)/profile')} />
          </View>
        </View>

        {/* Carrousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={tileW + 10}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          onMomentumScrollEnd={onScroll}
        >
          {tiles.map((t) => (
            <Pressable key={t.key} onPress={t.onPress} style={[s.tile, { width: tileW, backgroundColor: t.bg }]}>
              <View style={s.tileArt}>
                <View style={[s.tileArtDisk, { backgroundColor: t.fg === UC.white ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)' }]} />
                <Icon name={t.icon} size={72} color={t.fg === UC.white ? 'rgba(255,255,255,0.85)' : UC.white} />
              </View>
              <Text style={[s.tileTitle, { color: t.fg }]}>{t.title}</Text>
              {t.cents !== undefined && <Amount cents={Math.abs(t.cents)} currency={currency} size={28} color={t.fg} style={{ marginTop: 10 }} />}
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.dots}>
          {tiles.map((t, i) => <View key={t.key} style={i === page ? s.dotActive : s.dot} />)}
        </View>

        <View style={s.body}>
          {/* Compte / carte */}
          <Pressable style={s.account} onPress={() => router.push('/(client)/(tabs)/card')}>
            <Icon name="credit-card" size={24} color={UC.red} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={s.accountTop}>
                <Text style={s.accountName} numberOfLines={2}>Carte AlphaPay{'\n'}Prépayée</Text>
                <Amount cents={balanceCents} currency={currency} size={22} />
              </View>
              <Text style={s.accountBold}>Carte **** {card.number.slice(-4)} - AlphaPay</Text>
              <View style={s.accountTop}>
                <Text style={s.accountSub}>Solde disponible au {today()}</Text>
                <Icon name="more-vertical" size={20} color={UC.ink} />
              </View>
            </View>
          </Pressable>
          <Divider />

          {/* Raccourci factures */}
          <Pressable style={s.promo} onPress={() => router.push('/(client)/top-up')}>
            <View style={s.promoIcon}><Icon name="receipt-long" size={14} color={UC.white} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.promoTitle}>Factures & recharges</Text>
              <Text style={s.promoSub}>Payez-les d'ici !</Text>
            </View>
            <Icon name="chevron-right" size={22} color={UC.teal} />
          </Pressable>
          <Divider />

          {/* Mouvements */}
          <Pressable style={s.sectionHead} onPress={() => router.push('/(client)/(tabs)/history')}>
            <Text style={s.sectionTitle}>Mouvements récents</Text>
            <Icon name="chevron-right" size={22} color={UC.teal} />
          </Pressable>
          {recent.map((tx, i) => <TxLine key={tx.id} tx={tx} last={i === recent.length - 1} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  eyeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: UC.ink, alignItems: 'center', justifyContent: 'center' },

  tile: { height: 200, borderRadius: 10, padding: 16, overflow: 'hidden' },
  tileArt: { position: 'absolute', right: -6, bottom: -6, width: 130, height: 150, alignItems: 'center', justifyContent: 'center' },
  tileArtDisk: { position: 'absolute', width: 130, height: 130, borderRadius: 65 },
  tileTitle: { fontFamily: ucFont.condensed, fontSize: 21, fontWeight: '700', lineHeight: 27 },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: UC.inkSoft },
  dotActive: { width: 26, height: 8, borderRadius: 4, backgroundColor: UC.teal },

  body: { paddingHorizontal: 16 },
  account: { flexDirection: 'row', gap: 14, paddingVertical: 16 },
  accountTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  accountName: { flex: 1, fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },
  accountBold: { fontFamily: ucFont.condensed, fontSize: 14, fontWeight: '700', color: UC.ink },
  accountSub: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted },

  promo: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },
  promoIcon: { width: 24, height: 24, borderRadius: 5, backgroundColor: '#6F7A64', alignItems: 'center', justifyContent: 'center' },
  promoTitle: { fontFamily: ucFont.regular, fontSize: 14, color: UC.ink },
  promoSub: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, paddingBottom: 2 },
  sectionTitle: { fontFamily: ucFont.condensed, fontSize: 22, fontWeight: '700', color: UC.ink },

});
