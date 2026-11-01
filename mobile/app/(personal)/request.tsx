// Demander de l'argent : montant imposé, motif, validité ; QR et partage du lien.
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { B, F, R } from '@/brand';
import { ErrorLine, Label, LineField, Pill, PrimaryButton, Surface, TopBar, useStatusBar } from '@/bank';
import { FadeIn, Pop } from '@/motion';
import { fcfa } from '@/personalUi';
import { errorMessage, personal, type PRequest } from '@/api';

const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');

export default function RequestMoney() {
  const router = useRouter();
  useStatusBar('dark');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ttl, setTtl] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PRequest | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(personal)/alphapay'));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setReq(await personal.createRequest({ amount: Number(amount), reason: reason.trim(), ttl_hours: ttl }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <TopBar onBack={back} title="Demander de l’argent" />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {req ? (
          <>
            <Surface index={0} style={s.card}>
              <Text style={s.amount}>{fcfa(req.amount)}</Text>
              <Text style={s.reason}>{req.reason}</Text>
              <Pop style={s.qrBox}><QRCode value={req.qr_payload} size={200} color={B.navy} /></Pop>
              <Text style={s.help}>À scanner dans AlphaPay par la personne qui paie. Valable {ttl} h.</Text>
            </Surface>
            <PrimaryButton
              label="Partager la demande"
              icon="share-variant"
              onPress={() => Share.share({ message: `${req.from} vous demande ${fcfa(req.amount)} : ${req.reason}. Réglez-la dans AlphaPay (code ${req.code}).` })}
            />
            <PrimaryButton label="Terminé" variant="outline" onPress={() => router.replace('/(personal)/alphapay')} />
          </>
        ) : (
          <>
            <Surface index={0} style={s.amountBox}>
              <TextInput
                value={amount.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                onChangeText={(v) => setAmount(digits(v))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#B4BBC7"
                style={s.amountInput}
                accessibilityLabel="Montant demandé en francs CFA"
              />
              <Text style={s.amountCur}>FCFA</Text>
            </Surface>
            <FadeIn index={1} style={{ gap: 14 }}>
              <LineField label="Motif" value={reason} onChangeText={setReason} placeholder="Participation au cadeau" maxLength={120} />
              <Label>Valable</Label>
              <View style={s.pills}>{[6, 24, 72].map((h) => <Pill key={h} label={h === 72 ? '3 jours' : `${h} heures`} active={ttl === h} onPress={() => setTtl(h)} />)}</View>
            </FadeIn>
            <ErrorLine message={error} />
            <PrimaryButton label="Créer la demande" icon="qr-code" busy={busy} disabled={!Number(amount) || !reason.trim()} onPress={create} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 },
  card: { alignItems: 'center', gap: 8, paddingVertical: 22 },
  amount: { fontFamily: F.bold, fontSize: 32, color: B.ink },
  reason: { fontFamily: F.regular, fontSize: 15, color: B.muted },
  qrBox: { padding: 12, backgroundColor: B.white, borderRadius: R.md, borderWidth: 2, borderColor: B.mustard, marginVertical: 10 },
  help: { fontFamily: F.regular, fontSize: 13, color: B.muted, textAlign: 'center' },
  amountBox: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingVertical: 22 },
  amountInput: { fontFamily: F.bold, fontSize: 42, color: B.ink, minWidth: 60, textAlign: 'center', padding: 0 },
  amountCur: { fontFamily: F.medium, fontSize: 18, color: B.muted },
  pills: { flexDirection: 'row', gap: 8 },
});
