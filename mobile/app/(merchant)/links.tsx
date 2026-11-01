// Liens de paiement : création, partage (WhatsApp, SMS, autre) et désactivation.
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Amount, BigTitle, Divider, EmptyLine, ErrorLine, LineField, PrimaryButton, Spinner, Tag, TopBar, useStatusBar } from '@/bank';
import { createLink, deactivateLink, errorMessage, getLinks, type PaymentLink } from '@/api';
import { dateTime, LINK_STATE_LABEL } from '@/format';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';
import { B, F, R } from '@/brand';

export default function Links() {
  useStatusBar('dark');
  const router = useRouter();
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
      const link = await createLink(merchantId, mode, { description: form.description.trim(), ...(form.amount ? { amount: Number(form.amount) } : {}), multi_use: form.multi });
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
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <BigTitle>Liens de paiement</BigTitle>
      {canWrite && !open && <PrimaryButton label="Nouveau lien" icon="plus" onPress={() => setOpen(true)} />}
      {open && (
        <View style={{ gap: 18 }}>
          <LineField label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Commande n° 1042" maxLength={200} />
          <LineField label="Montant (XAF)" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v.replace(/[^\d]/g, '') })} keyboardType="number-pad" hint="Vide : le client saisit le montant." />
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Payable plusieurs fois</Text>
            <Switch value={form.multi} onValueChange={(v) => setForm({ ...form, multi: v })} trackColor={{ true: B.navy }} thumbColor={B.mustard} />
          </View>
          <ErrorLine message={error} />
          <PrimaryButton label="Créer et partager" busy={busy} disabled={!form.description.trim()} onPress={create} />
          <PrimaryButton label="Annuler" variant="outline" onPress={() => setOpen(false)} />
        </View>
      )}
      <ErrorLine message={list.error} />
      <Divider />
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/(merchant)/settings'))} />
      {list.loading && !list.data ? (
        <Spinner />
      ) : (
        <FlatList
          data={list.data?.data ?? []}
          keyExtractor={(l) => l.id}
          ListHeaderComponent={header}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.reload} />}
          ListEmptyComponent={<EmptyLine title="Aucun lien" body="Créez un lien et envoyez-le par WhatsApp ou SMS : le client paie par Mobile Money ou carte, sans compte." />}
          ItemSeparatorComponent={() => <Divider />}
          renderItem={({ item: l }) => (
            <View style={s.item}>
              <View style={s.rowTop}>
                <Text style={s.desc} numberOfLines={2}>{l.description}</Text>
                <Tag label={LINK_STATE_LABEL[l.state] ?? l.state} tone={l.state === 'actif' ? 'ok' : 'muted'} />
              </View>
              {l.amount != null ? <Amount value={l.amount} currency={l.currency} size={24} forceShow /> : <Text style={s.free}>Montant libre</Text>}
              <Text style={s.meta}>{l.payments_succeeded} paiement(s) · {dateTime(l.created_at)}{l.multi_use ? ' · réutilisable' : ''}</Text>
              {l.state === 'actif' && (
                <View style={s.actions}>
                  <Text style={s.act} onPress={() => Linking.openURL(l.share.whatsapp)}>WHATSAPP</Text>
                  <Text style={s.act} onPress={() => Share.share({ message: `${l.description} : ${l.url}` })}>PARTAGER</Text>
                  {canWrite && <Text style={[s.act, { color: B.burgundy }]} onPress={() => deactivate(l)}>DÉSACTIVER</Text>}
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontFamily: F.regular, fontSize: 17, color: B.ink },
  item: { paddingVertical: 16, gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  desc: { flex: 1, fontFamily: F.regular, fontSize: 17, color: B.ink },
  free: { fontFamily: F.bold, fontSize: 20, color: B.ink },
  meta: { fontFamily: F.regular, fontSize: 14, color: B.muted },
  actions: { flexDirection: 'row', gap: 22, marginTop: 6 },
  act: { fontFamily: F.bold, fontSize: 14, letterSpacing: 0.4, color: B.navy3 },
});
