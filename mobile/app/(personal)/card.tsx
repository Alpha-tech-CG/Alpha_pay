// Carte Visa virtuelle du particulier (D-066) : démonstration, l'émission réelle passera
// par la banque émettrice partenaire. Dépenses carte du mois suivies dans le budget.
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R, shadow } from '@/brand';
import { Amount, EmptyLine, ErrorLine, Hero, SectionHead, Spinner, Surface, TopBar, useStatusBar } from '@/bank';
import { CardArt, demoLast4 } from '@/CardArt';
import { FadeIn, PressScale } from '@/motion';
import { CategoryTile, fcfa } from '@/personalUi';
import { personal } from '@/api';
import { ago } from '@/format';
import { useSession } from '@/session';
import { useLoad } from '@/useLoad';

function Action({ icon, label, onPress, active }: { icon: string; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressScale style={s.action} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.actionIcon, active && { backgroundColor: B.burgundy }]}>
        <Icon name={icon} size={22} color={active ? B.white : B.navy} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </PressScale>
  );
}

export default function PersonalCard() {
  const router = useRouter();
  useStatusBar('light');
  const { width } = useWindowDimensions();
  const { user } = useSession();
  const [frozen, setFrozen] = useState(false);
  const data = useLoad(async () => {
    const [ov, entries] = await Promise.all([personal.overview(), personal.entries()]);
    const cards = new Set(ov.accounts.filter((a) => a.kind === 'card').map((a) => a.id));
    return { entries: entries.filter((e) => e.direction === 'out' && e.account_id && cards.has(e.account_id)), hasCardAccount: cards.size > 0 };
  }, []);
  const spent = (data.data?.entries ?? []).reduce((a, e) => a + e.amount, 0);

  const soon = (what: string) =>
    Alert.alert(what, 'Disponible dès que la banque émettrice partenaire aura émis les cartes AlphaPay. Cette carte est une démonstration : elle ne permet pas encore de payer.');

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <Hero style={{ paddingBottom: 70 }}>
          <View style={{ marginTop: -12, marginLeft: -14 }}><TopBar light title="Ma carte" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(personal)'))} /></View>
          <FadeIn style={{ alignItems: 'center', marginTop: 6 }}>
            <CardArt width={width - 56} holder={user?.fullName ?? 'AlphaPay'} last4={demoLast4(user?.id ?? 'alphapay')} frozen={frozen} kind="PERSONNELLE" />
          </FadeIn>
          <Text style={s.hint}>Touchez la carte pour la retourner · démonstration</Text>
        </Hero>

        <FadeIn index={1} style={s.actionsWrap}>
          <View style={s.actions}>
            <Action icon="shopping-bag" label="Payer en ligne" onPress={() => soon('Paiement en ligne')} />
            <Action icon={frozen ? 'lock' : 'snowflake'} label={frozen ? 'Débloquer' : 'Bloquer'} active={frozen} onPress={() => setFrozen((f) => !f)} />
            <Action icon="eye" label="Détails" onPress={() => soon('Détails de la carte')} />
            <Action icon="settings" label="Plafonds" onPress={() => soon('Plafonds de la carte')} />
          </View>
        </FadeIn>

        <View style={s.body}>
          <Surface index={2} style={s.spent}>
            <View style={s.spentIcon}><Icon name="credit-card" size={22} color={B.mustard} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.spentLabel}>Dépenses carte ce mois-ci</Text>
              <Amount value={spent} currency="FCFA" size={24} />
            </View>
          </Surface>

          <Surface index={3}>
            <SectionHead title="Achats par carte" />
            <ErrorLine message={data.error} />
            {data.loading && !data.data ? <Spinner /> : null}
            {data.data && data.data.entries.length === 0 && (
              <EmptyLine
                icon="credit-card"
                title="Aucun achat par carte"
                body={data.data.hasCardAccount ? 'Ajoutez vos achats en choisissant votre carte comme moyen de paiement.' : 'Ajoutez votre carte dans Plus › Mes comptes suivis pour suivre vos achats en ligne.'}
              />
            )}
            {data.data?.entries.map((e, i) => (
              <FadeIn key={e.id} index={i} style={s.row}>
                <CategoryTile category={e.category} size={38} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.rowLabel} numberOfLines={1}>{e.label}</Text>
                  <Text style={s.rowSub}>{e.category_name} · {ago(e.occurred_at)}</Text>
                </View>
                <Text style={s.rowAmount}>-{fcfa(e.amount)}</Text>
              </FadeIn>
            ))}
          </Surface>

          <FadeIn index={4}>
            <View style={s.secure}>
              <Icon name="shield-check" size={20} color={B.success} />
              <Text style={s.secureText}>Votre carte Visa AlphaPay sera émise par une banque partenaire agréée : vos achats en ligne seront protégés par 3-D Secure et visibles ici, catégorisés dans votre budget.</Text>
            </View>
          </FadeIn>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  hint: { fontFamily: F.medium, fontSize: 12, color: B.mustard, textAlign: 'center', marginTop: 14 },
  actionsWrap: { marginHorizontal: 16, marginTop: -44 },
  actions: { flexDirection: 'row', backgroundColor: B.surface, borderRadius: R.lg, paddingVertical: 14, ...shadow(2) },
  action: { flex: 1, alignItems: 'center', gap: 8, minHeight: 72 },
  actionIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: B.navySoft, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: F.medium, fontSize: 12, color: B.ink, textAlign: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  spent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  spentIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' },
  spentLabel: { fontFamily: F.medium, fontSize: 13, color: B.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLabel: { fontFamily: F.medium, fontSize: 15, color: B.ink },
  rowSub: { fontFamily: F.regular, fontSize: 12, color: B.muted },
  rowAmount: { fontFamily: F.bold, fontSize: 15, color: B.ink },
  secure: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: B.successSoft, borderRadius: R.md },
  secureText: { flex: 1, fontFamily: F.regular, fontSize: 13, color: '#1F4F3A', lineHeight: 19 },
});
