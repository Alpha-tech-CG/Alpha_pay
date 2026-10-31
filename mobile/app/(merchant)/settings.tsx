import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { AP } from '@/design';
import { Card, Segmented, SectionTitle } from '@/dash';
import { Button, ErrorBox, Header, InfoRow, Loading } from '@/kit';
import { API_URL, DASHBOARD_URL, getMembers } from '@/api';
import { ROLE_LABEL, useMerchant, useSession } from '@/session';
import { useLoad } from '@/useLoad';

const KYB_LABEL: Record<string, string> = {
  PENDING: 'En attente de validation',
  SUBMITTED: 'Envoyé',
  IN_REVIEW: 'En cours d’examen',
  INFO_REQUIRED: 'Informations demandées',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
};

export default function Settings() {
  const { user, logout } = useSession();
  const { membership, merchantId, role, mode, canLive, setMode } = useMerchant();
  const team = useLoad(() => getMembers(merchantId), [merchantId]);

  const confirmLogout = () =>
    Alert.alert('Se déconnecter ?', 'Vous devrez saisir votre mot de passe et un code pour revenir.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Header title="Réglages" />

        <Card>
          <SectionTitle>Commerce</SectionTitle>
          <InfoRow label="Nom" value={membership?.name} />
          <InfoRow label="Votre rôle" value={role ? ROLE_LABEL[role] : null} />
          <InfoRow label="Dossier" value={membership ? KYB_LABEL[membership.kybStatus] ?? membership.kybStatus : null} />
          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={s.label}>Mode</Text>
            {canLive ? (
              <Segmented options={['Live', 'Test']} value={mode === 'live' ? 'Live' : 'Test'} onChange={(v) => setMode(v === 'Live' ? 'live' : 'test')} />
            ) : (
              <Text style={s.help}>Test uniquement : le live s’ouvre quand votre dossier est validé.</Text>
            )}
          </View>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Mon compte</SectionTitle>
          <InfoRow label="Nom" value={user?.fullName} />
          <InfoRow label="Email" value={user?.email} />
          <InfoRow label="Téléphone" value={user?.phone} />
        </Card>

        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Équipe</SectionTitle>
          <ErrorBox message={team.error} />
          {team.loading && !team.data ? <Loading /> : null}
          {team.data?.filter((m) => m.status === 'ACTIVE').map((m) => (
            <InfoRow key={m.id} label={m.fullName ?? m.phone ?? m.email ?? 'Membre'} value={ROLE_LABEL[m.role] ?? m.role} />
          ))}
          <Text style={[s.help, { marginTop: 12 }]}>Invitations, boutiques, caisses, factures, opérateurs et clés API se gèrent depuis le tableau de bord web.</Text>
          <Button label="Ouvrir le tableau de bord web" variant="ghost" onPress={() => Linking.openURL(DASHBOARD_URL)} style={{ marginTop: 12 }} />
        </Card>

        <Button label="Se déconnecter" variant="danger" onPress={confirmLogout} style={{ marginTop: 24 }} />
        <Text style={s.version}>AlphaPay {Constants.expoConfig?.version} · {API_URL.replace(/^https?:\/\//, '')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '700', color: AP.secondary },
  help: { fontSize: 13, color: AP.mutedForeground, lineHeight: 18 },
  version: { textAlign: 'center', fontSize: 12, color: AP.mutedForeground, marginTop: 16 },
});
