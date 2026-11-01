// Ajouter une dépense ou une entrée (catégorie proposée en direct), ou corriger un
// mouvement existant : la correction est retenue pour ce libellé.
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { ErrorLine, Label, LineField, Pill, PrimaryButton, Surface, TopBar, useStatusBar } from '@/bank';
import { FadeIn, Pop } from '@/motion';
import { CategoryTile, fcfa } from '@/personalUi';
import { errorMessage, personal, type PEntry } from '@/api';
import { useLoad } from '@/useLoad';

const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');

export default function EntryScreen() {
  const router = useRouter();
  useStatusBar('dark');
  const params = useLocalSearchParams<{ id?: string; envelope?: string }>();
  const ctx = useLoad(async () => {
    const [ov, entries] = await Promise.all([personal.overview(), params.id ? personal.entries() : Promise.resolve([] as PEntry[])]);
    return { ov, entry: entries.find((e) => e.id === params.id) ?? null };
  }, [params.id]);
  const editing = ctx.data?.entry ?? null;

  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [envelopeId, setEnvelopeId] = useState<string | undefined>(params.envelope);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [guess, setGuess] = useState<{ category: string; category_name: string; learned: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (editing) setEnvelopeId(editing.envelope_id ?? undefined);
  }, [editing]);

  // Catégorie proposée pendant la saisie du libellé (règles apprises, puis mots-clés).
  useEffect(() => {
    if (editing || label.trim().length < 3) return setGuess(null);
    const t = setTimeout(() => {
      personal.categorize(label, direction).then((g) => {
        setGuess(g);
        if (direction === 'out' && g.envelope_id && !params.envelope) setEnvelopeId(g.envelope_id);
      }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [label, direction, editing, params.envelope]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(personal)/budget'));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await personal.updateEntry(editing.id, { envelope_id: envelopeId ?? '', category: ctx.data?.ov.envelopes.find((e) => e.id === envelopeId)?.key ?? editing.category });
      } else {
        await personal.createEntry({ direction, amount: Number(amount), label: label.trim(), envelope_id: direction === 'out' ? envelopeId : undefined, account_id: accountId });
      }
      setDone(true);
      setTimeout(back, 700);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    editing &&
    Alert.alert('Supprimer ce mouvement ?', 'Le solde du compte associé est rétabli.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => personal.deleteEntry(editing.id).then(back).catch((e) => setError(errorMessage(e))) },
    ]);

  if (done) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Pop><View style={s.doneIcon}><Icon name="check" size={44} color={B.white} /></View></Pop>
        <Text style={s.doneText}>{editing ? 'Catégorie retenue' : 'Enregistré'}</Text>
      </View>
    );
  }

  const envs = ctx.data?.ov.envelopes ?? [];
  const accounts = ctx.data?.ov.accounts ?? [];

  return (
    <View style={s.root}>
      <TopBar onBack={back} title={editing ? 'Mouvement' : 'Nouveau mouvement'} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {editing ? (
          <Surface index={0} style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
            <CategoryTile category={editing.category} size={52} tone={editing.direction === 'in' ? 'income' : 'navy'} />
            <Text style={s.editLabel}>{editing.label}</Text>
            <Text style={s.editAmount}>{editing.direction === 'in' ? '+' : '-'}{fcfa(editing.amount)}</Text>
            <Text style={s.hint}>Classé dans « {editing.category_name} ». Choisissez la bonne enveloppe : AlphaPay s’en souviendra.</Text>
          </Surface>
        ) : (
          <>
            <FadeIn style={s.seg}>
              {(['out', 'in'] as const).map((d) => <Pill key={d} label={d === 'out' ? 'Dépense' : 'Entrée d’argent'} active={direction === d} onPress={() => setDirection(d)} />)}
            </FadeIn>
            <Surface index={1} style={s.amountBox}>
              <TextInput
                value={amount.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                onChangeText={(v) => setAmount(digits(v))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#B4BBC7"
                style={s.amountInput}
                accessibilityLabel="Montant en francs CFA"
              />
              <Text style={s.amountCur}>FCFA</Text>
            </Surface>
            <FadeIn index={2} style={{ gap: 8 }}>
              <LineField label={direction === 'out' ? 'Où ou pour quoi ?' : 'De qui ou pour quoi ?'} value={label} onChangeText={setLabel} placeholder={direction === 'out' ? 'Supermarché, taxi, pharmacie…' : 'Salaire, remboursement…'} maxLength={80} />
              {guess && (
                <Pop>
                  <View style={s.guess}>
                    <Icon name="info" size={15} color={B.navy3} />
                    <Text style={s.guessText}>{guess.learned ? 'Comme d’habitude' : 'Catégorie proposée'} : {guess.category_name}</Text>
                  </View>
                </Pop>
              )}
            </FadeIn>
          </>
        )}

        {(editing ? editing.direction === 'out' : direction === 'out') && envs.length > 0 && (
          <FadeIn index={3} style={{ gap: 10 }}>
            <Label>Enveloppe</Label>
            <View style={s.pills}>
              {envs.map((e) => <Pill key={e.id} label={e.name} active={envelopeId === e.id} onPress={() => setEnvelopeId(envelopeId === e.id ? undefined : e.id)} />)}
            </View>
          </FadeIn>
        )}

        {!editing && accounts.length > 0 && (
          <FadeIn index={4} style={{ gap: 10 }}>
            <Label>{direction === 'out' ? 'Payé avec' : 'Reçu sur'}</Label>
            <View style={s.pills}>
              {accounts.map((a) => <Pill key={a.id} label={a.label} active={accountId === a.id} onPress={() => setAccountId(accountId === a.id ? undefined : a.id)} />)}
            </View>
          </FadeIn>
        )}

        <ErrorLine message={ctx.error ?? error} />
        <PrimaryButton label={editing ? 'Enregistrer la correction' : 'Enregistrer'} icon="check" busy={busy} disabled={!editing && (!Number(amount) || !label.trim())} onPress={save} />
        {editing && editing.source !== 'alphapay_transfer' && <PrimaryButton label="Supprimer" variant="outline" onPress={remove} />}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 },
  seg: { flexDirection: 'row', gap: 8 },
  amountBox: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingVertical: 22 },
  amountInput: { fontFamily: F.bold, fontSize: 42, color: B.ink, minWidth: 60, textAlign: 'center', padding: 0 },
  amountCur: { fontFamily: F.medium, fontSize: 18, color: B.muted },
  guess: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: B.navySoft, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  guessText: { fontFamily: F.medium, fontSize: 13, color: B.navy },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editLabel: { fontFamily: F.semibold, fontSize: 17, color: B.ink },
  editAmount: { fontFamily: F.bold, fontSize: 26, color: B.ink },
  hint: { fontFamily: F.regular, fontSize: 13, color: B.muted, textAlign: 'center', lineHeight: 19 },
  doneIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: B.success, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: F.bold, fontSize: 20, color: B.success, marginTop: 14 },
});
