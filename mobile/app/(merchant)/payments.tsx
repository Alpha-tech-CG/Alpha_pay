import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { EmptyLine, ErrorLine, Pill, Spinner, TabHeader, useStatusBar } from '@/bank';
import { PaymentRow } from '@/PaymentRow';
import { errorMessage, getPayments, type Payment } from '@/api';
import { useMerchant } from '@/session';
import { useLoad } from '@/useLoad';
import { B, F, R, shadow } from '@/brand';

const STATUSES = [
  { key: '', label: 'Tous' },
  { key: 'réussi', label: 'Réussis' },
  { key: 'en_attente', label: 'En attente' },
  { key: 'échoué', label: 'Échoués' },
];
const METHODS = [
  { key: '', label: 'Tous moyens' },
  { key: 'mtn', label: 'MTN' },
  { key: 'airtel', label: 'Airtel' },
  { key: 'card', label: 'Carte' },
];

export default function Payments() {
  useStatusBar('dark');
  const { merchantId, mode } = useMerchant();
  const [status, setStatus] = useState('');
  const [operator, setOperator] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [more, setMore] = useState<{ items: Payment[]; cursor: string | null; busy: boolean; error: string | null }>({ items: [], cursor: null, busy: false, error: null });

  const filters = { status: status || undefined, operator: operator || undefined, q: query || undefined, limit: 25 };
  const first = useLoad(async () => {
    const page = await getPayments(merchantId, mode, filters);
    setMore({ items: [], cursor: page.next_cursor, busy: false, error: null });
    return page;
  }, [merchantId, mode, status, operator, query], { pollMs: 20000 });

  const items = [...(first.data?.data ?? []), ...more.items];

  const loadMore = async () => {
    if (!more.cursor || more.busy) return;
    setMore((m) => ({ ...m, busy: true }));
    try {
      const page = await getPayments(merchantId, mode, { ...filters, starting_after: more.cursor });
      setMore((m) => ({ items: [...m.items, ...page.data], cursor: page.next_cursor, busy: false, error: null }));
    } catch (e) {
      setMore((m) => ({ ...m, busy: false, error: errorMessage(e) }));
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <TabHeader title="Paiements" subtitle={mode === 'live' ? 'Mode live' : 'Mode test'} />
      <View style={s.top}>
        <View style={s.search}>
          <Icon name="search" size={20} color={B.muted} />
          <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => setQuery(q.trim())} returnKeyType="search" placeholder="Rechercher une référence" placeholderTextColor="#98A1B2" style={s.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {STATUSES.map((f) => <Pill key={f.key} label={f.label} active={status === f.key} onPress={() => setStatus(f.key)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {METHODS.map((f) => <Pill key={f.key} label={f.label} active={operator === f.key} onPress={() => setOperator(f.key)} />)}
        </ScrollView>
        <ErrorLine message={first.error ?? more.error} />
      </View>
      {first.loading && !first.data ? (
        <Spinner />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => <PaymentRow p={item} index={index % 12} last={index === items.length - 1} />}
          contentContainerStyle={s.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={first.refreshing} onRefresh={first.reload} tintColor={B.mustard} colors={[B.navy]} />}
          ListEmptyComponent={<EmptyLine title="Aucun paiement" body="Aucun paiement ne correspond à ces critères." />}
          ListFooterComponent={more.busy ? <Spinner /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  top: { paddingHorizontal: 16, gap: 10, paddingBottom: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: B.surface, borderRadius: R.md, paddingHorizontal: 14, height: 50, ...shadow(1) },
  searchInput: { flex: 1, fontFamily: F.regular, fontSize: 15, color: B.ink },
  pills: { gap: 8 },
  list: { marginHorizontal: 16, marginTop: 8, paddingHorizontal: 16, paddingBottom: 24, backgroundColor: B.surface, borderRadius: R.lg },
});
