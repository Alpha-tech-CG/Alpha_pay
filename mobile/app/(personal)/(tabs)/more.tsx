// Plus : comptes suivis (soldes déclarés), rapport mensuel, alertes, espace marchand, déconnexion.
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { B, F } from '@/brand';
import { Amount, Divider, ErrorLine, Hero, Initials, Label, LineField, MenuRow, Pill, PrimaryButton, Spinner, Surface, useStatusBar } from '@/bank';
import { FadeIn, PressScale } from '@/motion';
import { ACCOUNT_META, AccountTile } from '@/personalUi';
import { errorMessage, personal, type PAccount } from '@/api';
import { useSession } from '@/session';
import { useLoad } from '@/useLoad';

const digits = (v: string) => v.replace(/\D/g, '');
const group = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function More() {
  const router = useRouter();
  useStatusBar('light');
  const { user, logout, setSpace } = useSession();
  const ov = useLoad(() => personal.overview(), []);
  const [form, setForm] = useState<{ id?: string; kind: PAccount['kind']; label: string; balance: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!form) return;
    try {
      if (form.id) await personal.updateAccount(form.id, { label: form.label.trim(), balance: Number(form.balance || 0) });
      else await personal.createAccount({ kind: form.kind, label: form.label.trim() || ACCOUNT_META[form.kind].label, balance: Number(form.balance || 0) });
      setForm(null);
      ov.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = (a: PAccount) =>
    Alert.alert(`Retirer ${a.label} ?`, 'Ses mouvements restent dans votre budget.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => personal.deleteAccount(a.id).then(() => { setForm(null); ov.reload(); }).catch((e) => setError(errorMessage(e))) },
    ]);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Hero>
          <FadeIn style={s.profile}>
            <Initials name={user?.fullName ?? 'AlphaPay'} size={62} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.name} numberOfLines={1}>{user?.fullName}</Text>
              <Text style={s.handle}>{user?.personal?.alphapay_id}</Text>
              <Text style={s.sub} numberOfLines={1}>{user?.phone}</Text>
            </View>
          </FadeIn>
        </Hero>
        <View style={s.body}>
          <ErrorLine message={ov.error ?? error} />
          <Surface index={0}>
            <Label>Mes comptes suivis</Label>
            {ov.loading && !ov.data ? <Spinner rows={2} /> : null}
            {ov.data?.accounts.map((a, i, all) => (
              <View key={a.id}>
                <PressScale scaleTo={0.985} onPress={() => setForm({ id: a.id, kind: a.kind, label: a.label, balance: String(a.balance) })} style={s.acc} accessibilityRole="button" accessibilityLabel={`Modifier ${a.label}`}>
                  <AccountTile kind={a.kind} />
                  <Text style={s.accLabel} numberOfLines={1}>{a.label}</Text>
                  <Amount value={a.balance} currency="FCFA" size={16} />
                </PressScale>
                {i < all.length - 1 && <Divider style={{ marginLeft: 54 }} />}
              </View>
            ))}
            {form ? (
              <FadeIn style={{ gap: 12, paddingTop: 12 }}>
                {!form.id && (
                  <View style={s.pills}>
                    {(Object.keys(ACCOUNT_META) as PAccount['kind'][]).map((k) => <Pill key={k} label={ACCOUNT_META[k].label} active={form.kind === k} onPress={() => setForm({ ...form, kind: k })} />)}
                  </View>
                )}
                <LineField label="Nom" value={form.label} onChangeText={(v) => setForm({ ...form, label: v })} placeholder={ACCOUNT_META[form.kind].label} maxLength={40} />
                <LineField label="Solde actuel (FCFA)" value={group(form.balance)} onChangeText={(v) => setForm({ ...form, balance: digits(v) })} keyboardType="number-pad" hint="Le solde affiché par votre MoMo ou votre banque : AlphaPay ne le lit pas à votre place." />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PrimaryButton label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setForm(null)} />
                  <PrimaryButton label="Enregistrer" style={{ flex: 1 }} onPress={save} />
                </View>
                {form.id && <Text style={s.danger} onPress={() => remove(ov.data!.accounts.find((a) => a.id === form.id)!)}>Retirer ce compte</Text>}
              </FadeIn>
            ) : (
              <PrimaryButton label="Ajouter un compte" icon="plus" variant="outline" style={{ marginTop: 12 }} onPress={() => setForm({ kind: 'mtn_momo', label: '', balance: '' })} />
            )}
          </Surface>

          <Surface index={1} style={{ paddingVertical: 4 }}>
            <MenuRow icon="receipt-long" label="Rapport mensuel" sub="Revenus, dépenses, épargne, conseil" onPress={() => router.push('/(personal)/report')} />
            <MenuRow icon="notifications-none" tone="mustard" label="Alertes" sub="Budget, objectifs, envois" onPress={() => router.push('/(personal)/alerts')} />
            <MenuRow icon="sliders-horizontal" label="Refaire mon budget" sub="Revenu et enveloppes de départ" onPress={() => router.push('/(personal)/setup')} last={!user?.merchants?.length} />
            {!!user?.merchants?.length && (
              <MenuRow icon="storefront" label="Espace marchand" sub={user.merchants[0].name} onPress={() => { setSpace('merchant'); router.replace('/(merchant)'); }} last />
            )}
          </Surface>

          <Surface index={2} style={{ paddingVertical: 4 }}>
            <MenuRow
              icon="log-out"
              tone="burgundy"
              label="Se déconnecter"
              onPress={() => Alert.alert('Se déconnecter ?', 'Vous devrez saisir votre mot de passe et un code pour revenir.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Se déconnecter', style: 'destructive', onPress: logout }])}
              last
            />
          </Surface>
          <Text style={s.version}>AlphaPay {Constants.expoConfig?.version} · AlphaPay ne détient pas votre argent</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { fontFamily: F.bold, fontSize: 22, color: B.white },
  handle: { fontFamily: F.semibold, fontSize: 14, color: B.mustard },
  sub: { fontFamily: F.regular, fontSize: 13, color: B.onNavyMuted },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  acc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  accLabel: { flex: 1, fontFamily: F.medium, fontSize: 15, color: B.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  danger: { fontFamily: F.semibold, fontSize: 14, color: B.burgundy, textAlign: 'center', paddingVertical: 6 },
  version: { textAlign: 'center', fontFamily: F.regular, fontSize: 12, color: B.muted, marginTop: 4 },
});
