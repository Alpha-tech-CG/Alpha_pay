// Première configuration : revenu (ou irrégulier), budget de départ proposé et modifiable,
// premier objectif d'épargne, premier compte suivi.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { B, F, R } from '@/brand';
import { ErrorLine, Hero, Label, LineField, Pill, PrimaryButton, Surface, useStatusBar } from '@/bank';
import { FadeIn } from '@/motion';
import { CategoryTile, fcfa } from '@/personalUi';
import { errorMessage, personal, type PAccount } from '@/api';

type Plan = { key: string; name: string; planned: number; on: boolean };
const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');
const group = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function Setup() {
  const router = useRouter();
  useStatusBar('light');
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState('');
  const [irregular, setIrregular] = useState(false);
  const [plan, setPlan] = useState<Plan[]>([]);
  const [goalName, setGoalName] = useState('Fonds d’urgence');
  const [goalTarget, setGoalTarget] = useState('300000');
  const [accKind, setAccKind] = useState<PAccount['kind']>('mtn_momo');
  const [accBalance, setAccBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revenu irrégulier : budget proposé sur une base prudente de 100 000 FCFA, à ajuster.
  const base = irregular || !Number(income) ? 100000 : Number(income);
  useEffect(() => {
    if (step !== 1) return;
    personal.suggestion(base).then((env) => setPlan(env.map((e) => ({ key: e.key, name: e.name, planned: e.planned, on: true })))).catch((e) => setError(errorMessage(e)));
  }, [step, base]);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      if (Number(accBalance) >= 0 && accBalance !== '') {
        const label = { mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank: 'Compte bancaire', card: 'Carte Visa', cash: 'Espèces' }[accKind];
        await personal.createAccount({ kind: accKind, label, balance: Number(accBalance) });
      }
      await personal.setup({
        monthly_income: irregular ? undefined : Number(income) || undefined,
        income_irregular: irregular,
        envelopes: plan.filter((p) => p.on).map((p) => ({ key: p.key, planned: p.planned })),
        ...(goalName.trim() && Number(goalTarget) ? { goal_name: goalName.trim(), goal_target: Number(goalTarget) } : {}),
      });
      router.replace('/(personal)');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const total = plan.filter((p) => p.on).reduce((a, p) => a + p.planned, 0);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Hero title="Mon budget" subtitle={`Étape ${step + 1} sur 3`}>
          <View style={s.steps}>{[0, 1, 2].map((i) => <View key={i} style={[s.step, i <= step && { backgroundColor: B.mustard }]} />)}</View>
        </Hero>
        <View style={s.body}>
          {step === 0 && (
            <FadeIn style={{ gap: 14 }}>
              <Text style={s.h1}>Combien gagnez-vous par mois ?</Text>
              <Text style={s.lead}>Nous proposons un budget de départ que vous pourrez modifier. Rien n’est partagé.</Text>
              <Surface style={{ gap: 14 }}>
                <View style={s.switchRow}>
                  <Text style={s.switchLabel}>Revenu irrégulier</Text>
                  <Switch value={irregular} onValueChange={setIrregular} trackColor={{ true: B.navy }} thumbColor={B.mustard} />
                </View>
                {!irregular && <LineField label="Revenu mensuel (FCFA)" value={group(income)} onChangeText={(v) => setIncome(digits(v))} keyboardType="number-pad" placeholder="200 000" />}
              </Surface>
              <PrimaryButton label="Continuer" disabled={!irregular && !Number(income)} onPress={() => setStep(1)} />
            </FadeIn>
          )}

          {step === 1 && (
            <FadeIn style={{ gap: 14 }}>
              <Text style={s.h1}>Votre budget de départ</Text>
              <Text style={s.lead}>Un rôle pour chaque franc. Décochez ce qui ne vous concerne pas et ajustez les montants.</Text>
              <Surface style={{ paddingVertical: 6 }}>
                {plan.map((p, i) => (
                  <View key={p.key} style={[s.planRow, i > 0 && s.planBorder, !p.on && { opacity: 0.45 }]}>
                    <CategoryTile category={p.key} size={36} />
                    <Text style={s.planName} numberOfLines={1}>{p.name}</Text>
                    <TextInput
                      value={group(String(p.planned))}
                      onChangeText={(v) => setPlan((all) => all.map((x) => (x.key === p.key ? { ...x, planned: Number(digits(v) || 0) } : x)))}
                      keyboardType="number-pad"
                      editable={p.on}
                      style={s.planInput}
                      accessibilityLabel={`Montant ${p.name}`}
                    />
                    <Switch value={p.on} onValueChange={(on) => setPlan((all) => all.map((x) => (x.key === p.key ? { ...x, on } : x)))} trackColor={{ true: B.navy }} thumbColor={B.mustard} />
                  </View>
                ))}
              </Surface>
              <Text style={[s.total, total > base && { color: B.burgundy }]}>Total prévu : {fcfa(total)}{!irregular ? ` sur ${fcfa(base)}` : ''}</Text>
              <ErrorLine message={error} />
              <PrimaryButton label="Continuer" disabled={!plan.some((p) => p.on)} onPress={() => setStep(2)} />
              <PrimaryButton label="Retour" variant="outline" onPress={() => setStep(0)} />
            </FadeIn>
          )}

          {step === 2 && (
            <FadeIn style={{ gap: 14 }}>
              <Text style={s.h1}>Un objectif et un compte</Text>
              <Surface style={{ gap: 14 }}>
                <Label>Premier objectif d’épargne</Label>
                <LineField label="Nom" value={goalName} onChangeText={setGoalName} placeholder="Téléphone, école, commerce…" maxLength={60} />
                <LineField label="Montant cible (FCFA)" value={group(goalTarget)} onChangeText={(v) => setGoalTarget(digits(v))} keyboardType="number-pad" />
              </Surface>
              <Surface style={{ gap: 14 }}>
                <Label>Compte à suivre (facultatif)</Label>
                <View style={s.pills}>
                  {(['mtn_momo', 'airtel_money', 'bank', 'cash'] as const).map((k) => (
                    <Pill key={k} label={{ mtn_momo: 'MTN MoMo', airtel_money: 'Airtel', bank: 'Banque', cash: 'Espèces' }[k]} active={accKind === k} onPress={() => setAccKind(k)} />
                  ))}
                </View>
                <LineField label="Solde actuel (FCFA)" value={group(accBalance)} onChangeText={(v) => setAccBalance(digits(v))} keyboardType="number-pad" placeholder="95 000" hint="Le solde que vous voyez dans votre MoMo ou votre banque. AlphaPay ne détient pas votre argent." />
              </Surface>
              <ErrorLine message={error} />
              <PrimaryButton label="Créer mon budget" icon="check" busy={busy} onPress={finish} />
              <PrimaryButton label="Retour" variant="outline" onPress={() => setStep(1)} />
            </FadeIn>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  body: { paddingHorizontal: 16, paddingTop: 20 },
  h1: { fontFamily: F.bold, fontSize: 22, color: B.ink, letterSpacing: -0.3 },
  lead: { fontFamily: F.regular, fontSize: 15, color: B.muted, lineHeight: 22 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontFamily: F.medium, fontSize: 16, color: B.ink },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  planBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: B.line },
  planName: { flex: 1, fontFamily: F.medium, fontSize: 14, color: B.ink },
  planInput: { width: 92, height: 40, borderRadius: R.sm, borderWidth: 1, borderColor: B.line, textAlign: 'right', paddingHorizontal: 8, fontFamily: F.semibold, fontSize: 14, color: B.ink },
  total: { fontFamily: F.semibold, fontSize: 14, color: B.inkSoft, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
