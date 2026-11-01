// Envoyer de l'argent par AlphaPay : bénéficiaire affiché avant confirmation, montant,
// enveloppe, confirmation biométrique. L'argent part ensuite de votre MoMo vers le sien
// (AlphaPay ne le détient jamais) ; le bénéficiaire confirme la réception.
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { ErrorLine, Initials, InfoRow, Label, LineField, Pill, PrimaryButton, Surface, TopBar, useStatusBar } from '@/bank';
import { FadeIn, Pop, Pulse } from '@/motion';
import { fcfa } from '@/personalUi';
import { errorMessage, newIdempotencyKey, personal, type PDeclared, type PEnvelope, type PRecipient, type PRequest } from '@/api';

const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');

async function confirmIdentity(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (!hardware || !enrolled) return true;
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirmer l’envoi', cancelLabel: 'Annuler' });
  return res.success;
}

export default function Send() {
  const router = useRouter();
  useStatusBar('dark');
  const params = useLocalSearchParams<{ to?: string; request?: string }>();
  const [to, setTo] = useState(params.to ?? '');
  const [recipient, setRecipient] = useState<PRecipient | null>(null);
  const [request, setRequest] = useState<PRequest | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [envelopes, setEnvelopes] = useState<PEnvelope[]>([]);
  const [envelopeId, setEnvelopeId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<PDeclared | null>(null);
  const [copied, setCopied] = useState(false);
  // Une clé par envoi : un double appui ou une reprise réseau ne crée pas de doublon.
  const key = useRef(newIdempotencyKey()).current;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(personal)/alphapay'));

  const find = async (value = to) => {
    setBusy(true);
    setError(null);
    try {
      setRecipient(await personal.lookup(value.trim()));
      setEnvelopes((await personal.overview()).envelopes);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (params.request) {
        try {
          const r = await personal.request(params.request);
          setRequest(r);
          setAmount(String(r.amount));
          setNote(r.reason);
          await find(r.from);
          return;
        } catch (e) {
          setError(errorMessage(e));
        }
      }
      if (params.to) await find(params.to);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.to, params.request]);

  const submit = async () => {
    if (!recipient) return;
    if (!(await confirmIdentity())) return;
    setBusy(true);
    setError(null);
    try {
      setSent(await personal.send({ to: recipient.alphapay_id, amount: Number(amount), note: note.trim() || undefined, envelope_id: envelopeId, request_code: request?.code }, key));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={[s.body, { paddingTop: 48 }]}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View style={s.ring}>
              <Pulse size={110} color={B.mustard} />
              <Pop><View style={s.ringIcon}><Icon name="send" size={40} color={B.navy} /></View></Pop>
            </View>
            <Text style={s.h1}>Dernière étape</Text>
            <Text style={s.lead}>Envoyez maintenant <Text style={{ fontFamily: F.bold, color: B.ink }}>{fcfa(sent.amount)}</Text> depuis votre MoMo vers le numéro de {sent.to.name ?? sent.to.alphapay_id}. Frais AlphaPay : 0 FCFA.</Text>
          </View>
          {sent.momo_number && (
            <Surface index={1} style={{ alignItems: 'center', gap: 10 }}>
              <Label>Numéro MoMo du bénéficiaire</Label>
              <Text style={s.number} selectable>{sent.momo_number}</Text>
              <PrimaryButton
                label={copied ? 'Numéro copié' : 'Copier le numéro'}
                icon={copied ? 'check' : 'content-copy'}
                variant="navy"
                style={{ alignSelf: 'stretch' }}
                onPress={() => Clipboard.setStringAsync(sent.momo_number!).then(() => setCopied(true))}
              />
            </Surface>
          )}
          <FadeIn index={2}>
            <Text style={s.note}>Le bénéficiaire confirmera la réception dans AlphaPay. Si l’argent ne part pas, annulez l’envoi depuis l’historique.</Text>
          </FadeIn>
          <PrimaryButton label="C’est fait" icon="check" onPress={() => router.replace('/(personal)/alphapay')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <TopBar onBack={back} title={request ? 'Régler une demande' : 'Envoyer'} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {!recipient ? (
          <FadeIn style={{ gap: 14 }}>
            <LineField label="Bénéficiaire" value={to} onChangeText={setTo} autoCapitalize="none" placeholder="@marie.alphapay ou 06 123 45 67" onSubmitEditing={() => find()} returnKeyType="search" />
            <ErrorLine message={error} />
            <PrimaryButton label="Rechercher" icon="search" busy={busy} disabled={to.trim().length < 3} onPress={() => find()} />
            <PrimaryButton label="Scanner un QR AlphaPay" icon="qr-code-scanner" variant="outline" onPress={() => router.replace('/(personal)/scan')} />
          </FadeIn>
        ) : (
          <>
            <Surface index={0} style={s.who}>
              <Initials name={recipient.name} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.whoName}>{recipient.name}</Text>
                <Text style={s.whoId}>{recipient.alphapay_id}</Text>
                {recipient.phone_masked ? <Text style={s.whoPhone}>{recipient.phone_masked}</Text> : null}
              </View>
              {!request && <Text style={s.change} onPress={() => setRecipient(null)}>Changer</Text>}
            </Surface>
            <Surface index={1} style={s.amountBox}>
              <TextInput
                value={amount.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                onChangeText={(v) => setAmount(digits(v))}
                editable={!request}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#B4BBC7"
                style={s.amountInput}
                accessibilityLabel="Montant à envoyer en francs CFA"
              />
              <Text style={s.amountCur}>FCFA</Text>
            </Surface>
            <FadeIn index={2} style={{ gap: 14 }}>
              <LineField label="Message (facultatif)" value={note} onChangeText={setNote} placeholder="Merci pour ton aide" maxLength={140} />
              {envelopes.length > 0 && (
                <>
                  <Label>Envoyer depuis l’enveloppe</Label>
                  <View style={s.pills}>{envelopes.map((e) => <Pill key={e.id} label={e.name} active={envelopeId === e.id} onPress={() => setEnvelopeId(envelopeId === e.id ? undefined : e.id)} />)}</View>
                </>
              )}
            </FadeIn>
            <Surface index={3}>
              <InfoRow label="Montant" value={fcfa(Number(amount || 0))} />
              <InfoRow label="Frais AlphaPay" value="0 FCFA" />
              <InfoRow label="Total débité de votre MoMo" value={fcfa(Number(amount || 0))} last />
            </Surface>
            <ErrorLine message={error} />
            <PrimaryButton label={`Confirmer l’envoi${Number(amount) ? ` de ${fcfa(Number(amount))}` : ''}`} icon="fingerprint" busy={busy} disabled={!Number(amount)} onPress={submit} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  whoName: { fontFamily: F.semibold, fontSize: 17, color: B.ink },
  whoId: { fontFamily: F.medium, fontSize: 14, color: B.navy3 },
  whoPhone: { fontFamily: F.regular, fontSize: 12, color: B.muted },
  change: { fontFamily: F.semibold, fontSize: 14, color: B.navy3, padding: 8 },
  amountBox: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingVertical: 22 },
  amountInput: { fontFamily: F.bold, fontSize: 42, color: B.ink, minWidth: 60, textAlign: 'center', padding: 0 },
  amountCur: { fontFamily: F.medium, fontSize: 18, color: B.muted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ring: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  ringIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: B.mustard, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.bold, fontSize: 24, color: B.ink },
  lead: { fontFamily: F.regular, fontSize: 15, color: B.muted, lineHeight: 22, textAlign: 'center' },
  number: { fontFamily: F.bold, fontSize: 26, color: B.navy, letterSpacing: 1 },
  note: { fontFamily: F.regular, fontSize: 13, color: B.muted, lineHeight: 19, textAlign: 'center' },
});
