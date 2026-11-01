// AlphaPay : identifiant et QR pour recevoir, envoi, demande de paiement, scan,
// réceptions à confirmer et historique.
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { Divider, EmptyLine, ErrorLine, Hero, PrimaryButton, SectionHead, Spinner, Surface, Tag, useStatusBar } from '@/bank';
import { FadeIn, Pop, PressScale } from '@/motion';
import { fcfa } from '@/personalUi';
import { errorMessage, personal, type PTransfer } from '@/api';
import { ago } from '@/format';
import { useLoad } from '@/useLoad';

const STATUS: Record<PTransfer['status'], { label: string; tone: 'ok' | 'bad' | 'wait' | 'muted' }> = {
  declared: { label: 'À confirmer', tone: 'wait' },
  confirmed: { label: 'Reçu', tone: 'ok' },
  disputed: { label: 'Contesté', tone: 'bad' },
  cancelled: { label: 'Annulé', tone: 'muted' },
};

function Action({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.action, primary && { backgroundColor: B.mustard }]}>
        <Icon name={icon} size={22} color={B.navy} />
        <Text style={s.actionText}>{label}</Text>
      </View>
    </PressScale>
  );
}

export default function AlphaPayTab() {
  const router = useRouter();
  useStatusBar('light');
  const data = useLoad(async () => {
    const [ov, transfers, requests] = await Promise.all([personal.overview(), personal.transfers(), personal.requests()]);
    return { profile: ov.profile, transfers, requests };
  }, [], { pollMs: 15000 });

  const act = (fn: () => Promise<unknown>) => fn().then(data.reload).catch((e) => Alert.alert('Impossible', errorMessage(e)));
  const toConfirm = (data.data?.transfers ?? []).filter((t) => t.direction === 'received' && t.status === 'declared');
  const history = (data.data?.transfers ?? []).filter((t) => !(t.direction === 'received' && t.status === 'declared'));
  const openRequests = (data.data?.requests ?? []).filter((r) => r.status === 'open');
  const p = data.data?.profile;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero title="AlphaPay" subtitle="Envoyez et recevez sans partager vos coordonnées bancaires" style={{ paddingBottom: 80 }} />
        <View style={s.body}>
          <FadeIn style={{ marginTop: -70 }}>
            <Surface style={s.qrCard}>
              {p ? (
                <>
                  <Pop style={s.qrBox}><QRCode value={p.qr_payload} size={180} color={B.navy} /></Pop>
                  <PressScale onPress={() => Clipboard.setStringAsync(p.alphapay_id)} style={s.handle} accessibilityRole="button" accessibilityLabel="Copier mon identifiant">
                    <Text style={s.handleText}>{p.alphapay_id}</Text>
                    <Icon name="content-copy" size={16} color={B.navy3} />
                  </PressScale>
                  <Text style={s.help}>Faites scanner ce QR ou partagez votre identifiant pour recevoir de l’argent.</Text>
                  <PrimaryButton label="Partager mon identifiant" icon="share-variant" variant="outline" style={{ alignSelf: 'stretch' }} onPress={() => Share.share({ message: `Envoyez-moi de l’argent avec AlphaPay : ${p.alphapay_id}` })} />
                </>
              ) : (
                <Spinner rows={2} />
              )}
            </Surface>
          </FadeIn>

          <FadeIn index={1} style={s.actions}>
            <Action icon="send" label="Envoyer" primary onPress={() => router.push('/(personal)/send')} />
            <Action icon="call-received" label="Demander" onPress={() => router.push('/(personal)/request')} />
            <Action icon="qr-code-scanner" label="Scanner" onPress={() => router.push('/(personal)/scan')} />
          </FadeIn>

          <ErrorLine message={data.error} />

          {toConfirm.length > 0 && (
            <Surface index={2} style={{ gap: 10, borderWidth: 1.5, borderColor: B.mustard }}>
              <SectionHead title="À confirmer" />
              {toConfirm.map((t) => (
                <View key={t.id} style={{ gap: 10 }}>
                  <Text style={s.confirmText}>
                    <Text style={{ fontFamily: F.semibold }}>{t.counterpart.name ?? t.counterpart.alphapay_id}</Text> dit vous avoir envoyé <Text style={{ fontFamily: F.bold }}>{fcfa(t.amount)}</Text> sur votre MoMo{t.note ? ` : « ${t.note} »` : ''}.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <PrimaryButton label="Pas reçu" variant="outline" style={{ flex: 1 }} onPress={() => act(() => personal.disputeTransfer(t.id))} />
                    <PrimaryButton label="Bien reçu" icon="check" style={{ flex: 1 }} onPress={() => act(() => personal.confirmTransfer(t.id))} />
                  </View>
                </View>
              ))}
            </Surface>
          )}

          {openRequests.length > 0 && (
            <Surface index={3}>
              <SectionHead title="Mes demandes en cours" />
              {openRequests.map((r, i) => (
                <View key={r.id}>
                  <View style={s.row}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.rowTitle}>{r.reason}</Text>
                      <Text style={s.rowSub}>{fcfa(r.amount)} · expire {ago(r.expires_at).replace('il y a', 'dans')}</Text>
                    </View>
                    <Text style={s.cancel} onPress={() => act(() => personal.cancelRequest(r.id))}>Annuler</Text>
                  </View>
                  {i < openRequests.length - 1 && <Divider />}
                </View>
              ))}
            </Surface>
          )}

          <Surface index={4}>
            <SectionHead title="Historique" />
            {data.loading && !data.data ? <Spinner /> : null}
            {history.length === 0 && data.data && <EmptyLine icon="swap-horiz" title="Aucun envoi" body="Vos envois et réceptions AlphaPay apparaîtront ici." />}
            {history.map((t, i) => (
              <FadeIn key={t.id} index={i}>
                <View style={s.row}>
                  <View style={[s.dir, { backgroundColor: t.direction === 'sent' ? B.navySoft : B.successSoft }]}>
                    <Icon name={t.direction === 'sent' ? 'arrow-up-right' : 'arrow-down-left'} size={20} color={t.direction === 'sent' ? B.navy : B.success} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{t.direction === 'sent' ? 'À ' : 'De '}{t.counterpart.name ?? t.counterpart.alphapay_id}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>{ago(t.created_at)}{t.note ? ` · ${t.note}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[s.amount, t.direction === 'received' && t.status === 'confirmed' && { color: B.success }]}>{t.direction === 'sent' ? '-' : '+'}{fcfa(t.amount)}</Text>
                    <Tag label={STATUS[t.status].label} tone={STATUS[t.status].tone} />
                  </View>
                </View>
                {t.direction === 'sent' && (t.status === 'declared' || t.status === 'disputed') && (
                  <Text style={s.cancel} onPress={() => Alert.alert('Annuler cet envoi ?', 'À faire seulement si l’argent n’est pas parti de votre MoMo.', [{ text: 'Non', style: 'cancel' }, { text: 'Annuler l’envoi', style: 'destructive', onPress: () => act(() => personal.cancelTransfer(t.id)) }])}>
                    Annuler l’envoi
                  </Text>
                )}
                {i < history.length - 1 && <Divider style={{ marginLeft: 54 }} />}
              </FadeIn>
            ))}
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  body: { paddingHorizontal: 16, gap: 14 },
  qrCard: { alignItems: 'center', gap: 12, paddingVertical: 22 },
  qrBox: { padding: 12, backgroundColor: B.white, borderRadius: R.md, borderWidth: 2, borderColor: B.mustard },
  handle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  handleText: { fontFamily: F.bold, fontSize: 18, color: B.navy },
  help: { fontFamily: F.regular, fontSize: 13, color: B.muted, textAlign: 'center', lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: R.lg, backgroundColor: B.surface },
  actionText: { fontFamily: F.semibold, fontSize: 13, color: B.navy },
  confirmText: { fontFamily: F.regular, fontSize: 14, color: B.ink, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  dir: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.medium, fontSize: 15, color: B.ink },
  rowSub: { fontFamily: F.regular, fontSize: 12, color: B.muted },
  amount: { fontFamily: F.bold, fontSize: 15, color: B.ink },
  cancel: { fontFamily: F.semibold, fontSize: 13, color: B.burgundy, paddingVertical: 6, paddingLeft: 54 },
});
