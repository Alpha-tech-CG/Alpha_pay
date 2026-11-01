// Objectifs d'épargne : l'argent reste sur votre compte, AlphaPay suit la progression.
// Versement ou retrait à tout moment ; arrondi automatique des dépenses.
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { B, F, R } from '@/brand';
import { Amount, EmptyLine, ErrorLine, Hero, Label, LineField, Pill, PrimaryButton, SectionHead, Spinner, Surface, useStatusBar } from '@/bank';
import { FadeIn, PressScale } from '@/motion';
import { fcfa, Gauge } from '@/personalUi';
import { errorMessage, personal, type PGoal } from '@/api';
import { useLoad } from '@/useLoad';

const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');
const group = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const EMOJIS = ['🎯', '🛟', '📱', '🎓', '🏪', '✈️', '🏠', '🚗'];

function GoalCard({ g, index, onChange, onError }: { g: PGoal; index: number; onChange: () => void; onError: (m: string) => void }) {
  const [amount, setAmount] = useState('');
  const [open, setOpen] = useState(false);
  const move = async (sign: 1 | -1) => {
    try {
      await personal.contribute(g.id, sign * Number(amount), sign > 0 ? 'Versement' : 'Retrait');
      setAmount('');
      setOpen(false);
      onChange();
    } catch (e) {
      onError(errorMessage(e));
    }
  };
  const days = g.target_date ? Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86_400_000) : null;
  return (
    <Surface index={index} style={{ gap: 12 }}>
      <PressScale scaleTo={0.99} onPress={() => setOpen(!open)} style={s.goalHead} accessibilityRole="button" accessibilityLabel={`${g.name}, ${g.progress} %`}>
        <View style={s.emojiBox}><Text style={s.emoji}>{g.emoji}</Text></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.goalName}>{g.name}</Text>
          <Text style={s.goalSub}>{days != null ? (days > 0 ? `Encore ${days} jours` : 'Échéance passée') : 'Sans échéance'}</Text>
        </View>
        <Text style={[s.pct, g.progress >= 100 && { color: B.success }]}>{g.progress} %</Text>
      </PressScale>
      <Gauge progress={g.progress} color={g.progress >= 100 ? B.success : B.mustard} height={10} />
      <View style={s.goalFoot}>
        <Amount value={g.saved} currency="FCFA" size={18} />
        <Text style={s.goalSub}>sur {fcfa(g.target)}</Text>
      </View>
      {open && (
        <FadeIn style={{ gap: 10 }}>
          <LineField label="Montant (FCFA)" value={group(amount)} onChangeText={(v) => setAmount(digits(v))} keyboardType="number-pad" hint="Mettez l’argent de côté sur votre compte, puis notez-le ici." />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton label="Retirer" variant="outline" style={{ flex: 1 }} disabled={!Number(amount)} onPress={() => move(-1)} />
            <PrimaryButton label="Épargner" style={{ flex: 1 }} disabled={!Number(amount)} onPress={() => move(1)} />
          </View>
          <Text
            style={s.archive}
            onPress={() => Alert.alert('Archiver cet objectif ?', 'Il disparaît de la liste ; son historique est conservé.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Archiver', style: 'destructive', onPress: () => personal.archiveGoal(g.id).then(onChange).catch((e) => onError(errorMessage(e))) }])}
          >
            Archiver l’objectif
          </Text>
        </FadeIn>
      )}
    </Surface>
  );
}

export default function Savings() {
  useStatusBar('light');
  const ov = useLoad(() => personal.overview(), []);
  const [form, setForm] = useState<{ name: string; target: string; emoji: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const goals = ov.data?.goals ?? [];
  const round = ov.data?.profile.round_up;
  const totalSaved = goals.reduce((a, g) => a + g.saved, 0);

  const create = async () => {
    if (!form) return;
    try {
      await personal.createGoal({ name: form.name.trim(), target: Number(form.target), emoji: form.emoji });
      setForm(null);
      ov.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const setRound = async (body: Parameters<typeof personal.settings>[0]) => {
    try {
      await personal.settings(body);
      ov.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={ov.refreshing} onRefresh={ov.reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero title="Épargne" subtitle="Votre argent reste sur votre compte">
          <FadeIn>
            <Text style={s.heroLabel}>Épargné au total</Text>
            <Amount value={totalSaved} currency="FCFA" size={34} color={B.mustard} />
            <Text style={s.heroSub}>{ov.data ? `${fcfa(ov.data.saved_this_month)} ce mois-ci` : ' '}</Text>
          </FadeIn>
        </Hero>
        <View style={s.body}>
          <ErrorLine message={ov.error ?? error} />
          {ov.loading && !ov.data ? <Surface><Spinner /></Surface> : null}
          {goals.length === 0 && ov.data && <Surface><EmptyLine icon="piggy-bank" title="Aucun objectif" body="Fonds d’urgence, école, téléphone, commerce : donnez un but à votre épargne." /></Surface>}
          {goals.map((g, i) => <GoalCard key={g.id} g={g} index={i} onChange={ov.reload} onError={setError} />)}

          {form ? (
            <Surface style={{ gap: 12 }}>
              <Label>Nouvel objectif</Label>
              <View style={s.emojis}>
                {EMOJIS.map((e) => (
                  <PressScale key={e} onPress={() => setForm({ ...form, emoji: e })} style={[s.emojiPick, form.emoji === e && s.emojiActive]} accessibilityRole="button" accessibilityLabel={`Icône ${e}`}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </PressScale>
                ))}
              </View>
              <LineField label="Nom" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Téléphone" maxLength={60} />
              <LineField label="Montant cible (FCFA)" value={group(form.target)} onChangeText={(v) => setForm({ ...form, target: digits(v) })} keyboardType="number-pad" placeholder="180 000" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PrimaryButton label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setForm(null)} />
                <PrimaryButton label="Créer" style={{ flex: 1 }} disabled={!form.name.trim() || !Number(form.target)} onPress={create} />
              </View>
            </Surface>
          ) : (
            <PrimaryButton label="Nouvel objectif" icon="plus" variant="outline" onPress={() => setForm({ name: '', target: '', emoji: '🎯' })} />
          )}

          {round && (
            <Surface index={goals.length + 1} style={{ gap: 12 }}>
              <SectionHead title="Arrondi automatique" />
              <View style={s.switchRow}>
                <Text style={s.switchText}>Arrondir chaque dépense et mettre la différence de côté</Text>
                <Switch value={round.enabled} onValueChange={(v) => setRound({ round_up_enabled: v, ...(v && !round.goal_id && goals[0] ? { round_up_goal_id: goals[0].id } : {}) })} trackColor={{ true: B.navy }} thumbColor={B.mustard} />
              </View>
              {round.enabled && (
                <FadeIn style={{ gap: 10 }}>
                  <Text style={s.example}>Exemple : 4 750 FCFA arrondi à {fcfa(Math.ceil(4750 / round.to) * round.to)}, soit {fcfa(Math.ceil(4750 / round.to) * round.to - 4750)} épargnés.</Text>
                  <Label>Arrondir au</Label>
                  <View style={s.emojis}>{[100, 500, 1000].map((to) => <Pill key={to} label={fcfa(to)} active={round.to === to} onPress={() => setRound({ round_up_to: to })} />)}</View>
                  <Label>Vers l’objectif</Label>
                  <View style={s.emojis}>{goals.map((g) => <Pill key={g.id} label={`${g.emoji} ${g.name}`} active={round.goal_id === g.id} onPress={() => setRound({ round_up_goal_id: g.id })} />)}</View>
                </FadeIn>
              )}
            </Surface>
          )}
          <Text style={s.legal}>AlphaPay ne place pas votre argent et ne promet aucun rendement : l’épargne reste sur votre MoMo ou votre compte, l’application suit vos objectifs.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  heroLabel: { fontFamily: F.medium, fontSize: 14, color: B.onNavyMuted },
  heroSub: { fontFamily: F.regular, fontSize: 13, color: B.onNavyMuted, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: B.mustardSoft, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  goalName: { fontFamily: F.semibold, fontSize: 16, color: B.ink },
  goalSub: { fontFamily: F.regular, fontSize: 13, color: B.muted },
  pct: { fontFamily: F.bold, fontSize: 18, color: B.navy },
  goalFoot: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  archive: { fontFamily: F.medium, fontSize: 13, color: B.burgundy, textAlign: 'center', paddingVertical: 6 },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiPick: { width: 46, height: 46, borderRadius: R.md, backgroundColor: B.lineSoft, alignItems: 'center', justifyContent: 'center' },
  emojiActive: { backgroundColor: B.mustardSoft, borderWidth: 2, borderColor: B.mustard },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, fontFamily: F.regular, fontSize: 14, color: B.ink, lineHeight: 20 },
  example: { fontFamily: F.regular, fontSize: 13, color: B.muted, lineHeight: 19 },
  legal: { fontFamily: F.regular, fontSize: 12, color: B.muted, lineHeight: 18, textAlign: 'center' },
});
