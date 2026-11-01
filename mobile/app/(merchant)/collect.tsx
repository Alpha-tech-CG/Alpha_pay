// Encaisser au comptoir : montant précis (clavier, puis QR d'un lien à usage unique)
// ou QR de la caisse (le client saisit le montant). Le client choisit Mobile Money ou
// carte Visa / Mastercard ; l'arrivée du paiement est suivie en direct.
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Linking from 'expo-linking';
import { Icon } from '@/components/Icon';
import { B, F, R, shadow } from '@/brand';
import { Amount, EmptyLine, ErrorLine, Hero, LineField, Pill, PrimaryButton, SectionHead, Spinner, Surface, useStatusBar } from '@/bank';
import { FadeIn, Pop, PressScale, Pulse } from '@/motion';
import { PaymentRow } from '@/PaymentRow';
import { createLink, errorMessage, getLinks, getMyTills, getPayments, type PaymentLink } from '@/api';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

const MAX = 5_000_000;

export default function Collect() {
  useStatusBar('light');
  const { merchantId, mode, can } = useMerchant();
  const canLink = can('paylinks:write');
  const [tab, setTab] = useState<'amount' | 'till'>(canLink ? 'amount' : 'till');
  const tills = useLoad(() => getMyTills(merchantId), [merchantId]);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={tills.refreshing} onRefresh={tills.reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero title="Encaisser" subtitle="MTN MoMo, Airtel Money ou carte Visa / Mastercard">
          {canLink && (
            <View style={s.seg}>
              {(['amount', 'till'] as const).map((k) => (
                <PressScale key={k} onPress={() => setTab(k)} style={[s.segItem, tab === k && s.segActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                  <Text style={[s.segText, tab === k && { color: B.navy }]}>{k === 'amount' ? 'Montant précis' : 'QR de la caisse'}</Text>
                </PressScale>
              ))}
            </View>
          )}
        </Hero>
        <View style={s.body}>
          {tab === 'amount' && canLink ? <AmountRequest merchantId={merchantId} mode={mode} /> : <TillQr merchantId={merchantId} mode={mode} tills={tills} canLink={canLink} />}
        </View>
      </ScrollView>
    </View>
  );
}

function TillQr({ merchantId, mode, tills, canLink }: { merchantId: string; mode: 'live' | 'test'; tills: ReturnType<typeof useLoad<Awaited<ReturnType<typeof getMyTills>>>>; canLink: boolean }) {
  const [tillId, setTillId] = useState<string | null>(null);
  const till = tills.data?.find((t) => t.id === tillId) ?? tills.data?.[0];
  return (
    <>
      <ErrorLine message={tills.error} />
      {tills.loading && !tills.data ? <Spinner /> : null}
      {tills.data?.length === 0 && (
        <Surface><EmptyLine icon="storefront" title="Aucune caisse" body={canLink ? 'Créez une boutique et une caisse depuis le tableau de bord web, ou utilisez « Montant précis ».' : 'Demandez au propriétaire de vous rattacher à une caisse.'} /></Surface>
      )}
      {tills.data && tills.data.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {tills.data.map((t) => <Pill key={t.id} label={`${t.store.name} · ${t.name}`} active={t.id === till?.id} onPress={() => setTillId(t.id)} />)}
        </ScrollView>
      )}
      {till && (
        <>
          <Surface index={0} style={s.qrCard}>
            <Text style={s.qrTitle}>{till.store.name}</Text>
            <Text style={s.qrSub}>{till.name}</Text>
            <Pop style={s.qrBox}><QRCode value={till.url} size={210} color={B.navy} /></Pop>
            <Text style={s.help}>Le client scanne, saisit le montant et choisit Mobile Money ou carte.</Text>
          </Surface>
          <PrimaryButton label="Partager le lien de la caisse" variant="outline" icon="share-variant" onPress={() => Share.share({ message: `Payez ${till.store.name} : ${till.url}` })} />
          <LivePayments merchantId={merchantId} mode={mode} tillId={till.id} />
        </>
      )}
    </>
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
    <Surface index={1}>
      <View style={s.liveHead}>
        <View style={s.liveDotWrap}><Pulse size={14} color={B.success} /><View style={s.liveDot} /></View>
        <SectionHead title="Arrivées en direct" />
      </View>
      <ErrorLine message={list.error} />
      {list.data?.data.length === 0 && <Text style={s.help}>Aucun paiement sur cette caisse pour l’instant.</Text>}
      {list.data?.data.map((p, i, a) => <PaymentRow key={p.id} p={p} index={i} last={i === a.length - 1} />)}
    </Surface>
  );
}

/** Montant au clavier, puis QR d'un lien à usage unique ; suit son paiement. */
function AmountRequest({ merchantId, mode }: { merchantId: string; mode: 'live' | 'test' }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!link || link.state !== 'actif') return;
    const id = setInterval(async () => {
      try {
        const fresh = (await getLinks(merchantId, mode)).data.find((l) => l.id === link.id);
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
      <>
        <Surface style={s.qrCard}>
          <Amount value={link.amount ?? 0} currency={link.currency} size={36} forceShow />
          <Text style={s.qrSub}>{link.description}</Text>
          {paid ? (
            <View style={s.paid}>
              <View style={s.paidRing}>
                <Pulse size={120} color={B.success} />
                <Pop><View style={s.paidIcon}><Icon name="check" size={52} color={B.white} /></View></Pop>
              </View>
              <Text style={s.paidText}>Paiement reçu</Text>
            </View>
          ) : (
            <>
              <Pop style={s.qrBox}><QRCode value={link.url} size={210} color={B.navy} /></Pop>
              <View style={s.waiting}>
                <View style={s.liveDotWrap}><Pulse size={14} color={B.mustard} /><View style={[s.liveDot, { backgroundColor: B.mustard }]} /></View>
                <Text style={s.waitingText}>{link.state === 'actif' ? 'En attente du paiement…' : `Lien ${link.state}`}</Text>
              </View>
            </>
          )}
        </Surface>
        {!paid && (
          <FadeIn index={1} style={{ gap: 10 }}>
            <PrimaryButton label="Le client paie par carte ici" icon="credit-card" variant="navy" onPress={() => Linking.openURL(link.url)} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PrimaryButton label="WhatsApp" variant="outline" icon="whatsapp" style={{ flex: 1 }} onPress={() => Linking.openURL(link.share.whatsapp)} />
              <PrimaryButton label="SMS" variant="outline" icon="send" style={{ flex: 1 }} onPress={() => Linking.openURL(link.share.sms)} />
            </View>
          </FadeIn>
        )}
        <PrimaryButton label="Nouveau montant" onPress={() => { setLink(null); setAmount(''); setDescription(''); }} />
      </>
    );
  }

  return (
    <>
      <Surface index={0} style={s.display}>
        <Text style={s.displayLabel}>Montant à encaisser</Text>
        <View style={s.amountRow}>
          <TextInput
            value={amount.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
            onChangeText={(v) => {
              setError(null);
              const digits = v.replace(/\D/g, '').replace(/^0+/, '');
              if (Number(digits) <= MAX) setAmount(digits);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="0"
            placeholderTextColor="#B4BBC7"
            style={s.amountInput}
            accessibilityLabel="Montant en francs CFA"
          />
          <Text style={s.amountCurrency}>XAF</Text>
        </View>
      </Surface>
      <FadeIn index={1} style={{ gap: 12 }}>
        <LineField label="Description (facultatif)" value={description} onChangeText={setDescription} placeholder="Commande n° 1042" maxLength={200} />
        <ErrorLine message={error} />
        <PrimaryButton label="Afficher le QR de paiement" icon="qr-code" busy={busy} disabled={!Number(amount)} onPress={create} />
      </FadeIn>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: R.pill, padding: 4 },
  segItem: { flex: 1, minHeight: 42, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: B.mustard },
  segText: { fontFamily: F.semibold, fontSize: 14, color: B.white },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  display: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  displayLabel: { fontFamily: F.medium, fontSize: 13, color: B.muted },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  amountInput: { fontFamily: F.bold, fontSize: 46, color: B.ink, minWidth: 60, textAlign: 'center', padding: 0, letterSpacing: -1 },
  amountCurrency: { fontFamily: F.medium, fontSize: 22, color: B.muted },
  qrCard: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  qrTitle: { fontFamily: F.bold, fontSize: 20, color: B.ink },
  qrSub: { fontFamily: F.regular, fontSize: 14, color: B.muted },
  qrBox: { padding: 14, backgroundColor: B.white, borderRadius: R.md, borderWidth: 2, borderColor: B.mustard, marginVertical: 10 },
  help: { fontFamily: F.regular, fontSize: 13, color: B.muted, textAlign: 'center', lineHeight: 19 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waitingText: { fontFamily: F.medium, fontSize: 14, color: B.inkSoft },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: B.success },
  paid: { alignItems: 'center', gap: 14, paddingVertical: 18 },
  paidRing: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  paidIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: B.success, alignItems: 'center', justifyContent: 'center' },
  paidText: { fontFamily: F.bold, fontSize: 22, color: B.success },
});
