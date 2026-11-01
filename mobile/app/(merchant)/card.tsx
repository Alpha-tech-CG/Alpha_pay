// Cartes : carte virtuelle AlphaPay Business (démonstration, en attente de la banque
// émettrice partenaire) et paiements par carte Visa / Mastercard reçus.
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R, shadow } from '@/brand';
import { Amount, EmptyLine, ErrorLine, Hero, SectionHead, Spinner, Surface, useStatusBar } from '@/bank';
import { CardArt, demoLast4 } from '@/CardArt';
import { FadeIn, PressScale } from '@/motion';
import { PaymentRow } from '@/PaymentRow';
import { getPayments } from '@/api';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

function Action({ icon, label, onPress, active }: { icon: string; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressScale style={s.action} onPress={onPress} accessibilityRole="button" accessibilityLabel={label.replace('\n', ' ')}>
      <View style={[s.actionIcon, active && { backgroundColor: B.burgundy }]}>
        <Icon name={icon} size={22} color={active ? B.white : B.navy} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </PressScale>
  );
}

export default function CardScreen() {
  const router = useRouter();
  useStatusBar('light');
  const { width } = useWindowDimensions();
  const { membership, merchantId, mode } = useMerchant();
  const [frozen, setFrozen] = useState(false);
  const cards = useLoad(() => getPayments(merchantId, mode, { operator: 'card', limit: 20 }), [merchantId, mode], { pollMs: 20000 });
  const received = (cards.data?.data ?? []).filter((p) => p.status === 'réussi').reduce((a, p) => a + p.amount - p.amount_refunded, 0);

  const soon = (what: string) =>
    Alert.alert(what, 'Disponible dès que la banque émettrice partenaire aura émis les cartes AlphaPay. Cette carte est une démonstration : elle ne permet pas encore de payer.');

  return (
    <View style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={cards.refreshing} onRefresh={cards.reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero title="Cartes" subtitle="Touchez la carte pour la retourner" style={{ paddingBottom: 70 }}>
          <FadeIn style={{ alignItems: 'center' }}>
            <CardArt width={width - 56} holder={membership?.name ?? 'AlphaPay'} last4={demoLast4(merchantId)} frozen={frozen} />
          </FadeIn>
          <View style={s.demo}>
            <Icon name="info" size={14} color={B.mustard} />
            <Text style={s.demoText}>Carte virtuelle de démonstration</Text>
          </View>
        </Hero>

        <FadeIn index={1} style={s.actionsWrap}>
          <View style={s.actions}>
            <Action icon="qr-code" label={'Encaisser\npar carte'} onPress={() => router.push('/(merchant)/collect')} />
            <Action icon={frozen ? 'lock' : 'snowflake'} label={frozen ? 'Débloquer' : 'Bloquer'} active={frozen} onPress={() => setFrozen((f) => !f)} />
            <Action icon="eye" label="Détails" onPress={() => soon('Détails de la carte')} />
            <Action icon="settings" label="Gestion" onPress={() => soon('Gestion de la carte')} />
          </View>
        </FadeIn>

        <View style={s.body}>
          <Surface index={2} style={s.received}>
            <View style={s.receivedIcon}><Icon name="credit-card" size={22} color={B.mustard} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.receivedLabel}>Reçu par carte Visa / Mastercard</Text>
              <Amount value={received} size={24} />
            </View>
          </Surface>

          <Surface index={3}>
            <SectionHead title="Paiements par carte" />
            <ErrorLine message={cards.error} />
            {cards.loading && !cards.data ? <Spinner /> : null}
            {cards.data?.data.length === 0 && (
              <EmptyLine icon="credit-card" title="Aucun paiement carte" body="Vos clients choisissent « Payer par carte bancaire » après avoir scanné votre QR ou ouvert votre lien." />
            )}
            {cards.data?.data.map((p, i, a) => <PaymentRow key={p.id} p={p} index={i} last={i === a.length - 1} />)}
          </Surface>

          <FadeIn index={4}>
            <View style={s.secure}>
              <Icon name="shield-check" size={20} color={B.success} />
              <Text style={s.secureText}>Les numéros de carte de vos clients ne passent jamais par AlphaPay : ils sont saisis sur la page sécurisée de la banque partenaire (3-D Secure). Seuls la marque et les 4 derniers chiffres sont gardés.</Text>
            </View>
          </FadeIn>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 16 },
  demoText: { fontFamily: F.medium, fontSize: 12, color: B.mustard },
  actionsWrap: { marginHorizontal: 16, marginTop: -44 },
  actions: { flexDirection: 'row', backgroundColor: B.surface, borderRadius: R.lg, paddingVertical: 14, ...shadow(2) },
  action: { flex: 1, alignItems: 'center', gap: 8, minHeight: 72 },
  actionIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: B.navySoft, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: F.medium, fontSize: 12, color: B.ink, textAlign: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  received: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  receivedIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' },
  receivedLabel: { fontFamily: F.medium, fontSize: 13, color: B.muted },
  secure: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: B.successSoft, borderRadius: R.md },
  secureText: { flex: 1, fontFamily: F.regular, fontSize: 13, color: '#1F4F3A', lineHeight: 19 },
});
