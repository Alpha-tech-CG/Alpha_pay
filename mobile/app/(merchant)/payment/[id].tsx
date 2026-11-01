import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { B, F, R } from '@/brand';
import { Amount, BrandTile, Divider, ErrorLine, InfoRow, Label, LineField, PrimaryButton, Spinner, Tag, TopBar, useStatusBar } from '@/bank';
import { errorMessage, getPayment, refundPayment } from '@/api';
import { dateTime, money, OPERATOR_LABEL, STATUS_LABEL, statusTone } from '@/format';

const TONE = { ok: 'ok', bad: 'bad', muted: 'wait' } as const;
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

const REFUND_STATUS: Record<string, string> = { en_attente: 'En cours', réussi: 'Remboursé', échoué: 'Refusé' };
const STEP: Record<string, string> = { PENDING: 'en attente', SUCCEEDED: 'réussi', FAILED: 'échoué', EXPIRED: 'expiré', CANCELLED: 'annulé' };
const step = (v: string | null) => (v ? STEP[v] ?? v.toLowerCase() : 'création');
const DISPUTE_STATUS: Record<string, string> = { OPEN: 'Ouvert', UNDER_REVIEW: 'En examen', WON: 'Gagné', LOST: 'Perdu' };

export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useStatusBar('dark');
  const { merchantId, mode } = useMerchant();
  const { data: p, error, loading, refreshing, reload } = useLoad(() => getPayment(merchantId, id), [merchantId, id], { pollMs: 10000 });
  const [refundOpen, setRefundOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const remaining = p ? p.amount - p.amount_refunded : 0;
  const isCard = p?.payment_method === 'card';

  const submitRefund = async () => {
    if (!p) return;
    const value = amount ? Number(amount.replace(/\s/g, '')) : remaining;
    const doIt = async () => {
      setBusy(true);
      setRefundError(null);
      try {
        await refundPayment(merchantId, mode, p.id, { amount: value, reason: reason.trim(), ...(isCard ? {} : { manual: true }) });
        setRefundOpen(false);
        setAmount('');
        setReason('');
        reload();
      } catch (e) {
        setRefundError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    };
    Alert.alert(
      isCard ? 'Rembourser par carte' : 'Déclarer un remboursement',
      isCard
        ? `${money(value, p.currency)} seront rendus sur la carte du client.`
        : `Confirmez que vous avez déjà rendu ${money(value, p.currency)} au client depuis votre compte ${OPERATOR_LABEL[p.operator] ?? p.operator}. AlphaPay l’enregistre, sans mouvement d’argent.`,
      [{ text: 'Annuler', style: 'cancel' }, { text: 'Confirmer', onPress: doIt }],
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/(merchant)/payments'))} title="Paiement" />
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <ErrorLine message={error} />
        {loading && !p ? <Spinner /> : null}
        {p && (
          <>
            <View style={s.hero}>
              <BrandTile brand={p.operator} size={48} />
              <Amount value={p.amount} currency={p.currency} size={40} color={p.status === 'réussi' ? B.success : B.ink} sign={p.status === 'réussi' ? '+' : undefined} forceShow />
              <Tag label={STATUS_LABEL[p.status] ?? p.status} tone={TONE[statusTone(p.status)]} />
              {p.amount_refunded > 0 && <Text style={s.refunded}>Remboursé : {money(p.amount_refunded, p.currency)}</Text>}
            </View>
            <Divider />

            <Label style={s.section}>Détails</Label>
            <InfoRow label="Moyen" value={OPERATOR_LABEL[p.operator] ?? p.operator} />
            {p.card ? <InfoRow label="Carte" value={`${p.card.brand ?? ''} •••• ${p.card.last4 ?? ''}`.trim()} /> : <InfoRow label="Payeur" value={p.payer_phone} />}
            <InfoRow label="Référence" value={p.reference} />
            <InfoRow label="Description" value={p.description} />
            <InfoRow label="Réf. opérateur" value={p.provider_reference} />
            <InfoRow label="Date" value={dateTime(p.created_at)} />
            {p.failure_reason ? <InfoRow label="Motif d’échec" value={p.failure_reason} /> : null}
            <InfoRow label="Mode" value={p.livemode ? 'Live' : 'Test'} last />

            {p.can_refund && !refundOpen && <PrimaryButton label="Rembourser" variant="outline" icon="replay" onPress={() => setRefundOpen(true)} style={{ marginTop: 20 }} />}
            {refundOpen && (
              <View style={{ gap: 18, marginTop: 20 }}>
                <Label>Remboursement</Label>
                <Text style={s.help}>
                  {isCard
                    ? 'La banque partenaire rend le montant sur la carte du client.'
                    : 'MTN et Airtel ne permettent pas de rembourser par l’API. Rendez l’argent depuis votre compte opérateur, puis déclarez-le ici.'}
                </Text>
                <LineField label={`Montant (max ${money(remaining, p.currency)})`} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder={String(remaining)} />
                <LineField label="Motif" value={reason} onChangeText={setReason} placeholder="Article retourné" />
                <ErrorLine message={refundError} />
                <PrimaryButton label={isCard ? 'Rembourser' : 'Déclarer le remboursement'} variant="red" busy={busy} disabled={!reason.trim()} onPress={submitRefund} />
                <PrimaryButton label="Annuler" variant="outline" onPress={() => setRefundOpen(false)} />
              </View>
            )}

            {p.refunds.length > 0 && (
              <>
                <Label style={s.section}>Remboursements</Label>
                {p.refunds.map((r, i, a) => (
                  <InfoRow key={r.id} label={`${dateTime(r.created_at)} · ${r.method === 'manual' ? 'déclaré' : 'carte'}`} value={`${r.amount_display} · ${REFUND_STATUS[r.status] ?? r.status}`} last={i === a.length - 1} />
                ))}
              </>
            )}

            {p.disputes.length > 0 && (
              <>
                <Label style={s.section}>Litiges</Label>
                {p.disputes.map((d) => (
                  <View key={d.id}>
                    <InfoRow label={DISPUTE_STATUS[d.status] ?? d.status} value={money(d.amount, p.currency)} last />
                    {d.reason ? <Text style={s.help}>Motif : {d.reason}</Text> : null}
                    {d.evidence_due_at && (d.status === 'OPEN' || d.status === 'UNDER_REVIEW') ? (
                      <Text style={s.help}>Répondre avant le {dateTime(d.evidence_due_at)}, depuis le tableau de bord web.</Text>
                    ) : null}
                  </View>
                ))}
              </>
            )}

            {p.audit_trail.length > 0 && (
              <>
                <Label style={s.section}>Historique</Label>
                {p.audit_trail.map((a, i, all) => (
                  <InfoRow key={i} label={dateTime(a.at)} value={`${step(a.from)} → ${step(a.to)}${a.reason ? ` (${a.reason})` : ''}`} last={i === all.length - 1} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 28 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  refunded: { fontFamily: F.regular, fontSize: 15, color: B.muted },
  section: { marginTop: 24, marginBottom: 2 },
  help: { fontFamily: F.regular, fontSize: 14, color: B.muted, lineHeight: 19 },
});
