// Enveloppes du mois (prévu, dépensé, restant) et mouvements, avec ajout et correction.
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { B, F } from '@/brand';
import { Amount, Divider, EmptyLine, ErrorLine, Hero, LineField, PrimaryButton, SectionHead, Spinner, Surface, useAmountsHidden, useStatusBar } from '@/bank';
import { FadeIn, PressScale } from '@/motion';
import { CategoryTile, envelopeColor, fcfa, Gauge } from '@/personalUi';
import { errorMessage, personal, type PEnvelope } from '@/api';
import { ago } from '@/format';
import { useLoad } from '@/useLoad';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');

export default function Budget() {
  const router = useRouter();
  useStatusBar('light');
  const [hidden] = useAmountsHidden();
  const data = useLoad(async () => {
    const [ov, entries] = await Promise.all([personal.overview(), personal.entries()]);
    return { ov, entries };
  }, []);
  const [form, setForm] = useState<{ name: string; planned: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const envs = data.data?.ov.envelopes ?? [];
  const planned = envs.reduce((a, e) => a + e.planned, 0);
  const spent = envs.reduce((a, e) => a + e.spent, 0);
  const month = data.data ? MONTHS[Number(data.data.ov.month.slice(5)) - 1] : '';

  const addEnvelope = async () => {
    if (!form) return;
    try {
      await personal.createEnvelope({ name: form.name.trim(), planned: Number(form.planned || 0) });
      setForm(null);
      data.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const editEnvelope = (e: PEnvelope) =>
    Alert.alert(e.name, `Prévu : ${fcfa(e.planned)} · Dépensé : ${fcfa(e.spent)}`, [
      { text: 'Fermer', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => personal.deleteEnvelope(e.id).then(data.reload).catch((x) => setError(errorMessage(x))) },
      { text: 'Ajouter une dépense', onPress: () => router.push({ pathname: '/(personal)/entry', params: { envelope: e.id } }) },
    ]);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero title="Budget" subtitle={month ? `Mois de ${month}` : undefined}>
          <FadeIn>
            <Text style={s.heroLabel}>Dépensé sur le prévu</Text>
            <View style={s.heroRow}>
              <Amount value={spent} currency="FCFA" size={30} color={B.white} />
              <Text style={s.heroOf}>/ {hidden ? '••••' : fcfa(planned)}</Text>
            </View>
            <View style={{ marginTop: 12 }}><Gauge progress={planned ? (spent / planned) * 100 : 0} color={spent > planned ? '#F2A7B0' : B.mustard} height={10} /></View>
          </FadeIn>
        </Hero>

        <View style={s.body}>
          <ErrorLine message={data.error ?? error} />
          <PrimaryButton label="Ajouter une dépense" icon="plus" onPress={() => router.push('/(personal)/entry')} />

          <Surface index={1}>
            <SectionHead title="Enveloppes" onPress={() => setForm({ name: '', planned: '' })} action="Nouvelle" />
            {data.loading && !data.data ? <Spinner /> : null}
            {form && (
              <FadeIn style={{ gap: 12, paddingBottom: 12 }}>
                <LineField label="Nom" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Cotisation, tontine…" maxLength={40} />
                <LineField label="Budget mensuel (FCFA)" value={form.planned} onChangeText={(v) => setForm({ ...form, planned: digits(v) })} keyboardType="number-pad" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PrimaryButton label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setForm(null)} />
                  <PrimaryButton label="Créer" style={{ flex: 1 }} disabled={!form.name.trim()} onPress={addEnvelope} />
                </View>
                <Divider />
              </FadeIn>
            )}
            {envs.map((e, i) => (
              <FadeIn key={e.id} index={i}>
                <PressScale scaleTo={0.985} onPress={() => editEnvelope(e)} style={s.env} accessibilityRole="button" accessibilityLabel={`${e.name}, ${e.progress} %`}>
                  <CategoryTile category={e.key ?? 'other'} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={s.envHead}>
                      <Text style={s.envName} numberOfLines={1}>{e.name}</Text>
                      <Text style={[s.envPct, { color: envelopeColor(e) === B.navy ? B.muted : envelopeColor(e) === B.mustard ? B.warning : B.burgundy }]}>{e.progress} %</Text>
                    </View>
                    <Gauge progress={e.progress} color={envelopeColor(e)} />
                    <Text style={s.envSub}>{hidden ? '••••' : `${fcfa(e.spent)} sur ${fcfa(e.planned)} · ${e.remaining < 0 ? `dépassé de ${fcfa(-e.remaining)}` : `${fcfa(e.remaining)} restants`}`}</Text>
                  </View>
                </PressScale>
                {i < envs.length - 1 && <Divider style={{ marginLeft: 56 }} />}
              </FadeIn>
            ))}
          </Surface>

          <Surface index={2}>
            <SectionHead title="Mouvements du mois" />
            {data.data?.entries.length === 0 && <EmptyLine title="Aucun mouvement" body="Ajoutez vos dépenses : la catégorie est proposée automatiquement." />}
            {data.data?.entries.map((m, i, a) => (
              <FadeIn key={m.id} index={i}>
                <PressScale scaleTo={0.985} onPress={() => router.push({ pathname: '/(personal)/entry', params: { id: m.id } })} style={s.entry} accessibilityRole="button">
                  <CategoryTile category={m.category} size={38} tone={m.direction === 'in' ? 'income' : 'navy'} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.entryLabel} numberOfLines={1}>{m.label}</Text>
                    <Text style={s.entrySub} numberOfLines={1}>{m.category_name} · {ago(m.occurred_at)}{m.round_up ? ` · arrondi +${fcfa(m.round_up)}` : ''}</Text>
                  </View>
                  <Amount value={m.amount} currency="F" size={16} sign={m.direction === 'in' ? '+' : '-'} color={m.direction === 'in' ? B.success : B.ink} />
                </PressScale>
                {i < a.length - 1 && <Divider style={{ marginLeft: 52 }} />}
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
  heroLabel: { fontFamily: F.medium, fontSize: 14, color: B.onNavyMuted },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  heroOf: { fontFamily: F.medium, fontSize: 16, color: B.onNavyMuted },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  env: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  envHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  envName: { flex: 1, fontFamily: F.semibold, fontSize: 15, color: B.ink },
  envPct: { fontFamily: F.bold, fontSize: 13 },
  envSub: { fontFamily: F.regular, fontSize: 12, color: B.muted },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  entryLabel: { fontFamily: F.medium, fontSize: 15, color: B.ink },
  entrySub: { fontFamily: F.regular, fontSize: 12, color: B.muted },
});
