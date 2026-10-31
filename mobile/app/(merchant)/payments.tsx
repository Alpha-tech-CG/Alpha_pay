import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AP, radius } from '@/design';
import { Icon } from '@/components/Icon';
import { Chip, Empty, ErrorBox, Header, Loading, ModeBadge } from '@/kit';
import { PaymentRow } from '@/PaymentRow';
import { errorMessage, getPayments, type Payment } from '@/api';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';

const FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'réussi', label: 'Réussis' },
  { key: 'en_attente', label: 'En attente' },
  { key: 'échoué', label: 'Échoués' },
  { key: 'expiré', label: 'Expirés' },
];

export default function Payments() {
  const { merchantId, mode } = useMerchant();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [more, setMore] = useState<{ items: Payment[]; cursor: string | null; busy: boolean; error: string | null }>({ items: [], cursor: null, busy: false, error: null });

  const first = useLoad(async () => {
    const page = await getPayments(merchantId, mode, { status: status || undefined, q: query || undefined, limit: 25 });
    setMore({ items: [], cursor: page.next_cursor, busy: false, error: null });
    return page;
  }, [merchantId, mode, status, query], { pollMs: 20000 });

  const items = [...(first.data?.data ?? []), ...more.items];

  const loadMore = async () => {
    if (!more.cursor || more.busy) return;
    setMore((m) => ({ ...m, busy: true }));
    try {
      const page = await getPayments(merchantId, mode, { status: status || undefined, q: query || undefined, limit: 25, starting_after: more.cursor });
      setMore((m) => ({ items: [...m.items, ...page.data], cursor: page.next_cursor, busy: false, error: null }));
    } catch (e) {
      setMore((m) => ({ ...m, busy: false, error: errorMessage(e) }));
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.top}>
        <Header title="Paiements" right={<ModeBadge mode={mode} />} />
        <View style={s.search}>
          <Icon name="search" size={18} color={AP.mutedForeground} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setQuery(q.trim())}
            returnKeyType="search"
            placeholder="Référence de commande ou de l’opérateur"
            placeholderTextColor={AP.mutedForeground}
            style={s.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={status === f.key} onPress={() => setStatus(f.key)} />
          ))}
        </ScrollView>
        <ErrorBox message={first.error ?? more.error} />
      </View>
      {first.loading && !first.data ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PaymentRow p={item} />}
          contentContainerStyle={s.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={first.refreshing} onRefresh={first.reload} />}
          ListEmptyComponent={<Empty title="Aucun paiement" body="Aucun paiement ne correspond à ces critères." />}
          ListFooterComponent={more.busy ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  top: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15, color: AP.foreground },
  chips: { gap: 8, paddingBottom: 4 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
});
