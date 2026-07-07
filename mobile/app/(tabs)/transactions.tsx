import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, Pressable, RefreshControl,
  ActivityIndicator, TextInput, StyleSheet,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pill } from '@/ui';
import { getStats, Stats } from '@/api';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const FILTERS: { key: string; label: string }[] = [
  { key: 'ALL', label: '30 derniers jours' },
  { key: 'SUCCESSFUL', label: 'Réussis' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'FAILED', label: 'Échoués' },
];

const TXN_ICONS: Record<string, { icon: IconName; bg: string; color: string }> = {
  SUCCESSFUL: { icon: 'payments',        bg: 'rgba(0,106,98,0.1)',   color: C.secondary },
  PENDING:    { icon: 'schedule',        bg: 'rgba(180,83,9,0.1)',   color: C.pending },
  FAILED:     { icon: 'cancel',          bg: 'rgba(186,26,26,0.1)',  color: C.error },
  DEFAULT:    { icon: 'account-balance', bg: C.surfaceContainerHigh, color: C.muted },
};

function groupByDate(items: Stats['recent']) {
  const groups: { date: string; items: Stats['recent'] }[] = [];
  const seen = new Map<string, number>();
  items.forEach((item) => {
    const d = new Date(item.createdAt);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Aujourd'hui";
    else if (d.toDateString() === yesterday.toDateString()) label = 'Hier';
    else label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    if (!seen.has(label)) { seen.set(label, groups.length); groups.push({ date: label, items: [] }); }
    groups[seen.get(label)!].items.push(item);
  });
  return groups;
}

export default function Transactions() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setStats(await getStats()); }
    catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = (stats?.recent ?? []).filter((t) => {
    const matchFilter = filter === 'ALL' || t.status === filter;
    const matchSearch = search === '' || t.payerPhone.includes(search) || t.externalId.includes(search);
    return matchFilter && matchSearch;
  });
  const groups = groupByDate(filtered);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
        <ActivityIndicator color={C.primary} size="large" />
      </SafeAreaView>
    );
  }

  type FlatItem =
    | { type: 'header'; title: string; id: string }
    | { type: 'txn'; item: Stats['recent'][number]; id: string };

  const flatData: FlatItem[] = [];
  groups.forEach((g) => {
    flatData.push({ type: 'header', title: g.date, id: 'h-' + g.date });
    g.items.forEach((item) => flatData.push({ type: 'txn', item, id: item.id }));
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {/* Header */}
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Historique</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <MaterialIcons name="search" size={20} color={C.muted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Rechercher paiements, numéros…"
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow}
        renderItem={({ item: f }) => (
          <Pressable onPress={() => setFilter(f.key)} style={[s.chip, filter === f.key && s.chipActive]}>
            <Text style={[s.chipText, filter === f.key && s.chipTextActive]}>{f.label}</Text>
          </Pressable>
        )}
        style={{ flexGrow: 0, marginBottom: 8 }}
      />

      {/* Transactions */}
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
        ListEmptyComponent={
          <Text style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>Aucune transaction</Text>
        }
        renderItem={({ item: row }) => {
          if (row.type === 'header') {
            return <Text style={s.dateLabel}>{row.title}</Text>;
          }
          const { item } = row;
          const ico = TXN_ICONS[item.status] ?? TXN_ICONS.DEFAULT;
          return (
            <Pressable style={s.txnCard}>
              <View style={[s.txnIcon, { backgroundColor: ico.bg }]}>
                <MaterialIcons name={ico.icon} size={22} color={ico.color} style={{ fontVariationSettings: "'FILL' 1" } as object} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.txnName} numberOfLines={1}>{item.payerPhone}</Text>
                <Text style={s.txnSub}>
                  {item.externalId} · {new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.txnAmt, { color: item.status === 'SUCCESSFUL' ? C.secondary : C.text }]}>
                  {item.status === 'SUCCESSFUL' ? '+' : ''}{Number(item.amount).toLocaleString('fr-FR')} XAF
                </Text>
                <Pill status={item.status} />
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  topBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginVertical: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, height: 50 },
  searchIcon: { marginLeft: 14 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: C.text, fontFamily: undefined },

  chipRow: { paddingHorizontal: 20, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipActive: { backgroundColor: C.secondaryContainer, borderColor: C.secondaryContainer },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.onSecondaryContainer },

  dateLabel: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },

  txnCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.surface, borderRadius: 16, marginBottom: 10, shadowColor: '#0035c5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  txnIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  txnName: { fontSize: 15, fontWeight: '600', color: C.text },
  txnSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  txnAmt: { fontSize: 16, fontWeight: '600' },
});
