// Encaisser au comptoir : QR de la caisse (le client saisit le montant) ou QR
// d'un montant précis (lien à usage unique), avec l'arrivée des paiements en direct.
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Linking from 'expo-linking';
import { AP, radius, soft } from '@/design';
import { ucFont } from '@/uc';
import { Card, Segmented, SectionTitle } from '@/dash';
import { Icon } from '@/components/Icon';
import { Button, Chip, Empty, ErrorBox, Field, Header, Loading, ModeBadge } from '@/kit';
import { PaymentRow } from '@/PaymentRow';
import { createLink, errorMessage, getLinks, getMyTills, getPayments, type PaymentLink } from '@/api';
import { money } from '@/format';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

const TILL = 'QR de la caisse';
const AMOUNT = 'Montant précis';

export default function Collect() {
  const { merchantId, mode, can } = useMerchant();
  const canLink = can('paylinks:write');
  const [tab, setTab] = useState(TILL);
  const tills = useLoad(() => getMyTills(merchantId), [merchantId]);
  const [tillId, setTillId] = useState<string | null>(null);
  const till = tills.data?.find((t) => t.id === tillId) ?? tills.data?.[0];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={tills.refreshing} onRefresh={tills.reload} />}>
        <Header title="Encaisser" right={<ModeBadge mode={mode} />} />
        {canLink && (
          <View style={{ marginBottom: 16 }}>
            <Segmented options={[TILL, AMOUNT]} value={tab} onChange={setTab} />
          </View>
        )}

        {tab === TILL && (
          <>
            <ErrorBox message={tills.error} />
            {tills.loading && !tills.data ? <Loading /> : null}
            {tills.data?.length === 0 && (
              <Empty icon="storefront" title="Aucune caisse" body={canLink ? 'Créez une boutique et une caisse depuis le tableau de bord web (Boutiques), ou utilisez « Montant précis ».' : 'Demandez au propriétaire de vous rattacher à une caisse.'} />
            )}
            {tills.data && tills.data.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                {tills.data.map((t) => (
                  <Chip key={t.id} label={`${t.store.name} · ${t.name}`} active={t.id === till?.id} onPress={() => setTillId(t.id)} />
                ))}
              </ScrollView>
            )}
            {till && (
              <>
                <Card style={s.qrCard}>
                  <Text style={s.qrTitle}>{till.store.name}</Text>
                  <Text style={s.qrSub}>{till.name}</Text>
                  <View style={s.qrBox}><QRCode value={till.url} size={220} /></View>
                  <Text style={s.qrHelp}>Le client scanne, saisit le montant et valide sur son téléphone (Mobile Money ou carte).</Text>
                  <Text style={s.code} selectable>{till.url}</Text>
                  <Button label="Partager le lien de la caisse" variant="ghost" onPress={() => Share.share({ message: `Payez ${till.store.name} : ${till.url}` })} />
                </Card>
                <LivePayments merchantId={merchantId} mode={mode} tillId={till.id} />
              </>
            )}
          </>
        )}

        {tab === AMOUNT && canLink && <AmountRequest merchantId={merchantId} mode={mode} />}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Paiements de la caisse, rafraîchis toutes les 5 s ; vibre à chaque paiement réussi. */
function LivePayments({ merchantId, mode, tillId }: { merchantId: string; mode: 'live' | 'test'; tillId: string }) {
  const list = useLoad(() => getPayments(merchantId, mode, { till_id: tillId, limit: 5 }), [merchantId, mode, tillId], { pollMs: 5000 });
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ok = (list.data?.data ?? []).filter((p) => p.status === 'réussi').map((p) => p.id);
    if (seen.current && ok.some((id) => !seen.current!.has(id))) Vibration.vibrate([0, 200, 100, 200]);
    if (list.data) seen.current = new Set(ok);
  }, [list.data]);
  return (
    <Card style={{ marginTop: 16 }}>
      <SectionTitle>Arrivées en direct</SectionTitle>
      <ErrorBox message={list.error} />
      {list.data?.data.length === 0 && <Text style={s.qrHelp}>Aucun paiement sur cette caisse pour l’instant.</Text>}
      {list.data?.data.map((p) => <PaymentRow key={p.id} p={p} />)}
    </Card>
  );
}

/** Lien à usage unique pour un montant donné, affiché en QR ; suit son paiement. */
function AmountRequest({ merchantId, mode }: { merchantId: string; mode: 'live' | 'test' }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suivi de l'état du lien jusqu'au paiement.
  useEffect(() => {
    if (!link || link.state !== 'actif') return;
    const id = setInterval(async () => {
      try {
        const page = await getLinks(merchantId, mode);
        const fresh = page.data.find((l) => l.id === link.id);
        if (fresh && fresh.state !== link.state) {
          if (fresh.state === 'utilisé') Vibration.vibrate([0, 200, 100, 200]);
          setLink(fresh);
        }
      } catch {
        /* nouvelle tentative au prochain tour */
      }
    }, 4000);
    return () => clearInterval(id);
  }, [link, merchantId, mode]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await createLink(merchantId, mode, { amount: Number(amount), description: description.trim() || 'Paiement au comptoir' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (link) {
    const paid = link.state === 'utilisé';
    return (
      <Card style={s.qrCard}>
        <Text style={s.qrAmount}>{money(link.amount, link.currency)}</Text>
        <Text style={s.qrSub}>{link.description}</Text>
        {paid ? (
          <View style={s.paid}>
            <Icon name="check-circle" size={56} color={AP.chart3} />
            <Text style={s.paidText}>Paiement reçu</Text>
          </View>
        ) : (
          <>
            <View style={s.qrBox}><QRCode value={link.url} size={220} /></View>
            <Text style={s.qrHelp}>{link.state === 'actif' ? 'En attente du paiement…' : `Lien ${link.state}`}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              <Button label="WhatsApp" variant="ghost" style={{ flex: 1 }} onPress={() => Linking.openURL(link.share.whatsapp)} />
              <Button label="SMS" variant="ghost" style={{ flex: 1 }} onPress={() => Linking.openURL(link.share.sms)} />
            </View>
          </>
        )}
        <Button label="Nouveau montant" onPress={() => { setLink(null); setAmount(''); setDescription(''); }} style={{ alignSelf: 'stretch' }} />
      </Card>
    );
  }

  return (
    <Card style={{ gap: 14 }}>
      <Field label="Montant (XAF)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="15000" />
      <Field label="Description" value={description} onChangeText={setDescription} placeholder="Commande n° 1042" maxLength={200} />
      <ErrorBox message={error} />
      <Button label="Afficher le QR" busy={busy} disabled={!Number(amount)} onPress={create} />
    </Card>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  qrCard: { alignItems: 'center', gap: 10 },
  qrTitle: { fontSize: 20, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  qrAmount: { fontSize: 30, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  qrSub: { fontSize: 14, color: AP.mutedForeground },
  qrBox: { padding: 16, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: AP.border, marginVertical: 6 },
  qrHelp: { fontSize: 13, color: AP.mutedForeground, textAlign: 'center', lineHeight: 18 },
  code: { fontSize: 12, color: AP.primary, backgroundColor: soft.primary05, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  paid: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  paidText: { fontSize: 22, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.chart3 },
});
