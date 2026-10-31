import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP } from '@/design';
import { ucFont } from '@/uc';
import { Card, SectionTitle, StatusPill } from '@/dash';
import { Button, ErrorBox, Field, InfoRow, Loading } from '@/kit';
import { errorMessage, getPayment, refundPayment } from '@/api';
import { dateTime, money, OPERATOR_LABEL, STATUS_LABEL, statusTone } from '@/format';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

const REFUND_STATUS: Record<string, string> = { en_attente: 'En cours', réussi: 'Remboursé', échoué: 'Refusé' };
const STEP: Record<string, string> = { PENDING: 'en attente', SUCCEEDED: 'réussi', FAILED: 'échoué', EXPIRED: 'expiré', CANCELLED: 'annulé' };
const step = (v: string | null) => (v ? STEP[v] ?? v.toLowerCase() : 'création');
const DISPUTE_STATUS: Record<string, string> = { OPEN: 'Ouvert', UNDER_REVIEW: 'En examen', WON: 'Gagné', LOST: 'Perdu' };

export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(merchant)/payments'))} style={s.back}>
        <Icon name="arrow-back" size={22} color={AP.secondary} />
        <Text style={s.backText}>Paiements</Text>
      </Pressable>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <ErrorBox message={error} />
        {loading && !p ? <Loading /> : null}
        {p && (
          <>
            <View style={s.hero}>
              <Text style={s.amount}>{p.amount_display}</Text>
              <StatusPill label={STATUS_LABEL[p.status] ?? p.status} tone={statusTone(p.status)} />
              {p.amount_refunded > 0 && <Text style={s.refunded}>Remboursé : {money(p.amount_refunded, p.currency)}</Text>}
            </View>

            <Card>
              <InfoRow label="Moyen" value={OPERATOR_LABEL[p.operator] ?? p.operator} />
              {p.card ? <InfoRow label="Carte" value={`${p.card.brand ?? ''} •••• ${p.card.last4 ?? ''}`.trim()} /> : <InfoRow label="Payeur" value={p.payer_phone} />}
              <InfoRow label="Référence" value={p.reference} />
              <InfoRow label="Description" value={p.description} />
              <InfoRow label="Réf. opérateur" value={p.provider_reference} />
              <InfoRow label="Date" value={dateTime(p.created_at)} />
              {p.failure_reason ? <InfoRow label="Motif d’échec" value={p.failure_reason} /> : null}
              <InfoRow label="Mode" value={p.livemode ? 'Live' : 'Test'} />
            </Card>

            {p.can_refund && !refundOpen && (
              <Button label="Rembourser" variant="ghost" onPress={() => setRefundOpen(true)} style={{ marginTop: 16 }} />
            )}
            {refundOpen && (
              <Card style={{ marginTop: 16, gap: 12 }}>
                <SectionTitle>Remboursement</SectionTitle>
                <Text style={s.help}>
                  {isCard
                    ? 'La banque partenaire rend le montant sur la carte du client.'
                    : 'MTN et Airtel ne permettent pas de rembourser par l’API. Rendez l’argent depuis votre compte opérateur, puis déclarez-le ici.'}
                </Text>
                <Field label={`Montant (max ${money(remaining, p.currency)})`} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder={String(remaining)} />
                <Field label="Motif" value={reason} onChangeText={setReason} placeholder="Article retourné" />
                <ErrorBox message={refundError} />
                <Button label={isCard ? 'Rembourser' : 'Déclarer le remboursement'} variant="danger" busy={busy} disabled={!reason.trim()} onPress={submitRefund} />
                <Button label="Annuler" variant="ghost" onPress={() => setRefundOpen(false)} />
              </Card>
            )}

            {p.refunds.length > 0 && (
              <Card style={{ marginTop: 16 }}>
                <SectionTitle>Remboursements</SectionTitle>
                {p.refunds.map((r) => (
                  <InfoRow key={r.id} label={`${dateTime(r.created_at)} · ${r.method === 'manual' ? 'déclaré' : 'carte'}`} value={`${r.amount_display} · ${REFUND_STATUS[r.status] ?? r.status}`} />
                ))}
              </Card>
            )}

            {p.disputes.length > 0 && (
              <Card style={{ marginTop: 16 }}>
                <SectionTitle>Litiges</SectionTitle>
                {p.disputes.map((d) => (
                  <View key={d.id} style={{ gap: 4, paddingVertical: 8 }}>
                    <InfoRow label={DISPUTE_STATUS[d.status] ?? d.status} value={money(d.amount, p.currency)} />
                    {d.reason ? <Text style={s.help}>Motif : {d.reason}</Text> : null}
                    {d.evidence_due_at && (d.status === 'OPEN' || d.status === 'UNDER_REVIEW') ? (
                      <Text style={s.help}>Répondre avant le {dateTime(d.evidence_due_at)}, depuis le tableau de bord web.</Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            )}

            {p.audit_trail.length > 0 && (
              <Card style={{ marginTop: 16 }}>
                <SectionTitle>Historique</SectionTitle>
                {p.audit_trail.map((a, i) => (
                  <InfoRow key={i} label={dateTime(a.at)} value={`${step(a.from)} → ${step(a.to)}${a.reason ? ` (${a.reason})` : ''}`} />
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  backText: { fontSize: 16, color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 28 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  amount: { fontSize: 34, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary, fontVariant: ['tabular-nums'] },
  refunded: { fontSize: 14, color: AP.mutedForeground },
  help: { fontSize: 13, color: AP.mutedForeground, lineHeight: 18 },
});
