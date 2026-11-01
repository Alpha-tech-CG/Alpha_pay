import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { B, F, R } from '@/brand';
import { ErrorLine, Hero, InfoRow, Initials, Label, MenuRow, Spinner, Surface, Tag, useStatusBar } from '@/bank';
import { FadeIn, PressScale } from '@/motion';
import { API_URL, DASHBOARD_URL, errorMessage, getMembers, personal } from '@/api';
import { ROLE_LABEL, useMerchant, useSession } from '@/session';
import { useLoad } from '@/useLoad';

const KYB: Record<string, { label: string; tone: 'ok' | 'bad' | 'wait' }> = {
  PENDING: { label: 'En attente de validation', tone: 'wait' },
  APPROVED: { label: 'Validé', tone: 'ok' },
  REJECTED: { label: 'Refusé', tone: 'bad' },
};

export default function More() {
  useStatusBar('light');
  const router = useRouter();
  const { user, logout, refreshUser, setSpace } = useSession();
  const { membership, merchantId, role, mode, canLive, setMode, can } = useMerchant();
  const team = useLoad(() => getMembers(merchantId), [merchantId]);
  const kyb = membership ? KYB[membership.kybStatus] : undefined;

  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', 'Vous devrez saisir votre mot de passe et un code pour revenir.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Hero>
          <FadeIn style={s.profile}>
            <Initials name={membership?.name ?? 'AlphaPay'} size={62} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.name} numberOfLines={1}>{membership?.name}</Text>
              <Text style={s.sub} numberOfLines={1}>{user?.fullName ?? user?.email}{role ? ` · ${ROLE_LABEL[role]}` : ''}</Text>
              {kyb ? <View style={{ marginTop: 4 }}><Tag label={`Dossier : ${kyb.label}`} tone={kyb.tone} /></View> : null}
            </View>
          </FadeIn>
        </Hero>

        <View style={s.body}>
          <Surface index={0}>
            <Label>Mode</Label>
            {canLive ? (
              <View style={s.seg}>
                {(['live', 'test'] as const).map((m) => (
                  <PressScale key={m} onPress={() => setMode(m)} style={[s.segItem, mode === m && s.segActive]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
                    <Text style={[s.segText, mode === m && { color: B.white }]}>{m === 'live' ? 'Live' : 'Test'}</Text>
                  </PressScale>
                ))}
              </View>
            ) : (
              <Text style={s.help}>Test uniquement : le live s’ouvre quand votre dossier est validé.</Text>
            )}
          </Surface>

          <Surface index={1} style={{ paddingVertical: 4 }}>
            {can('payments:view') && <MenuRow icon="link" label="Liens de paiement" sub="Créer, partager, désactiver" onPress={() => router.push('/(merchant)/links')} />}
            <MenuRow icon="credit-card" tone="mustard" label="Cartes" sub="Carte virtuelle et paiements Visa / Mastercard" onPress={() => router.push('/(merchant)/card')} />
            <MenuRow icon="public" label="Tableau de bord web" sub="Boutiques, factures, opérateurs, clés API" onPress={() => Linking.openURL(DASHBOARD_URL)} />
            <MenuRow
              icon="piggy-bank"
              tone="mustard"
              label="Mon espace particulier"
              sub={user?.personal ? user.personal.alphapay_id : 'Budget, épargne et envois AlphaPay'}
              onPress={async () => {
                try {
                  if (!user?.personal) {
                    await personal.activate();
                    await refreshUser();
                  }
                  setSpace('personal');
                  router.replace('/(personal)');
                } catch (e) {
                  Alert.alert('Impossible', errorMessage(e));
                }
              }}
              last
            />
          </Surface>

          <Surface index={2}>
            <Label>Mon compte</Label>
            <InfoRow label="Email" value={user?.email} />
            <InfoRow label="Téléphone" value={user?.phone} last />
          </Surface>

          <Surface index={3}>
            <Label>Équipe</Label>
            <ErrorLine message={team.error} />
            {team.loading && !team.data ? <Spinner rows={2} /> : null}
            {team.data?.filter((m) => m.status === 'ACTIVE').map((m, i, a) => (
              <InfoRow key={m.id} label={m.fullName ?? m.phone ?? m.email ?? 'Membre'} value={ROLE_LABEL[m.role] ?? m.role} last={i === a.length - 1} />
            ))}
          </Surface>

          <Surface index={4} style={{ paddingVertical: 4 }}>
            <MenuRow icon="log-out" tone="burgundy" label="Se déconnecter" onPress={confirmLogout} last />
          </Surface>
          <Text style={s.version}>AlphaPay {Constants.expoConfig?.version} · {API_URL.replace(/^https?:\/\//, '')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { fontFamily: F.bold, fontSize: 22, color: B.white },
  sub: { fontFamily: F.regular, fontSize: 14, color: B.onNavyMuted },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  seg: { flexDirection: 'row', backgroundColor: B.lineSoft, borderRadius: R.pill, padding: 4, marginTop: 10 },
  segItem: { flex: 1, minHeight: 42, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: B.navy },
  segText: { fontFamily: F.semibold, fontSize: 14, color: B.inkSoft },
  help: { fontFamily: F.regular, fontSize: 14, color: B.muted, marginTop: 8, lineHeight: 20 },
  version: { textAlign: 'center', fontFamily: F.regular, fontSize: 12, color: B.muted, marginTop: 6 },
});
