// Liens de paiement : création, partage (WhatsApp, SMS, autre) et désactivation.
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { AP } from '@/design';
import { ucFont } from '@/uc';
import { Card, StatusPill } from '@/dash';
import { Button, Empty, ErrorBox, Field, Header, Loading, ModeBadge } from '@/kit';
import { createLink, deactivateLink, errorMessage, getLinks, type PaymentLink } from '@/api';
import { dateTime, LINK_STATE_LABEL, money } from '@/format';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

export default function Links() {
  const { merchantId, mode, can } = useMerchant();
  const canWrite = can('paylinks:write');
  const list = useLoad(() => getLinks(merchantId, mode), [merchantId, mode]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', multi: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await createLink(merchantId, mode, {
        description: form.description.trim(),
        ...(form.amount ? { amount: Number(form.amount) } : {}),
        multi_use: form.multi,
      });
      list.setData((d) => (d ? { ...d, data: [link, ...d.data] } : d));
      setOpen(false);
      setForm({ amount: '', description: '', multi: false });
      Share.share({ message: `${link.description} : ${link.url}` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = (l: PaymentLink) =>
    Alert.alert('Désactiver ce lien ?', 'Il ne pourra plus être payé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Désactiver',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await deactivateLink(merchantId, mode, l.id);
            list.setData((d) => (d ? { ...d, data: d.data.map((x) => (x.id === l.id ? updated : x)) } : d));
          } catch (e) {
            Alert.alert('Impossible', errorMessage(e));
          }
        },
      },
    ]);

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <Header title="Liens de paiement" right={<ModeBadge mode={mode} />} />
      {canWrite && !open && <Button label="Nouveau lien" onPress={() => setOpen(true)} />}
      {open && (
        <Card style={{ gap: 12 }}>
          <Field label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Commande n° 1042" maxLength={200} />
          <Field label="Montant (XAF)" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v.replace(/[^\d]/g, '') })} keyboardType="number-pad" hint="Vide : le client saisit le montant." />
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Payable plusieurs fois</Text>
            <Switch value={form.multi} onValueChange={(v) => setForm({ ...form, multi: v })} trackColor={{ true: AP.primary }} />
          </View>
          <ErrorBox message={error} />
          <Button label="Créer et partager" busy={busy} disabled={!form.description.trim()} onPress={create} />
          <Button label="Annuler" variant="ghost" onPress={() => setOpen(false)} />
        </Card>
      )}
      <ErrorBox message={list.error} />
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <FlatList
          data={list.data?.data ?? []}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={header}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.reload} />}
          ListEmptyComponent={<Empty icon="link" title="Aucun lien" body="Créez un lien et envoyez-le par WhatsApp ou SMS : le client paie sans compte." />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item: l }) => (
            <Card style={{ gap: 8 }}>
              <View style={s.rowTop}>
                <Text style={s.desc} numberOfLines={2}>{l.description}</Text>
                <StatusPill label={LINK_STATE_LABEL[l.state] ?? l.state} tone={l.state === 'actif' ? 'ok' : 'muted'} />
              </View>
              <Text style={s.amount}>{l.amount != null ? money(l.amount, l.currency) : 'Montant libre'}</Text>
              <Text style={s.meta}>{l.payments_succeeded} paiement(s) · créé le {dateTime(l.created_at)}{l.multi_use ? ' · réutilisable' : ''}</Text>
              {l.state === 'actif' && (
                <View style={s.actions}>
                  <Button label="WhatsApp" variant="ghost" style={s.action} onPress={() => Linking.openURL(l.share.whatsapp)} />
                  <Button label="Partager" variant="ghost" style={s.action} onPress={() => Share.share({ message: `${l.description} : ${l.url}` })} />
                  {canWrite && <Button label="Désactiver" variant="ghost" style={s.action} onPress={() => deactivate(l)} />}
                </View>
              )}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontSize: 15, color: AP.secondary },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  desc: { flex: 1, fontSize: 16, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  amount: { fontSize: 20, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  meta: { fontSize: 12, color: AP.mutedForeground },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1, height: 40, paddingHorizontal: 6 },
});
