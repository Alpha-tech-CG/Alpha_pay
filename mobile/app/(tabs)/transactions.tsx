import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, Card, Pill } from '@/ui';
import { getStats, Stats } from '@/api';
import { C } from '@/theme';

const FILTERS = ['ALL', 'PENDING', 'SUCCESSFUL', 'FAILED'] as const;

export default function Transactions() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setStats(await getStats()); } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = (stats?.recent ?? []).filter((t) => filter === 'ALL' || t.status === filter);

  const Header = (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' }}>
      {FILTERS.map((f) => (
        <Pressable key={f} onPress={() => setFilter(f)} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: filter === f ? C.primary : C.surfaceAlt }}>
          <Text style={{ color: filter === f ? '#fff' : C.muted, fontWeight: '700', fontSize: 12 }}>{f === 'ALL' ? 'Tout' : f}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (loading) return <Screen title="Transactions"><ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /></Screen>;

  return (
    <Screen title="Transactions">
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={Header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.muted, marginTop: 24 }}>Aucune transaction</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }} numberOfLines={1}>{item.externalId}</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.payerPhone} · {new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{Number(item.amount).toLocaleString('fr-FR')} <Text style={{ fontSize: 11, color: C.muted }}>{item.currency}</Text></Text>
                <Pill status={item.status} />
              </View>
            </Card>
          </View>
        )}
      />
    </Screen>
  );
}
