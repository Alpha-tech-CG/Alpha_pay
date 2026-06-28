import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, Card, Pill } from '@/ui';
import { getStats, Stats } from '@/api';
import { C } from '@/theme';

function operatorVolume(s: Stats | null, op: string) {
  return s?.byOperator.find((o) => o.operator === op)?.volume ?? 0;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await getStats());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const success = stats?.totals.find((t) => t.status === 'SUCCESSFUL');
  const volume = success ? Number(success.volume).toLocaleString('fr-FR') : '0';

  const Hero = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <View style={{ backgroundColor: C.primary, borderRadius: 18, padding: 18 }}>
        <Text style={{ color: '#9FE1CB', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>VOLUME TOTAL ENCAISSÉ</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 }}>
          {volume} <Text style={{ fontSize: 16, color: '#E1F5EE' }}>XAF</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {(['MTN', 'AIRTEL'] as const).map((op) => (
            <View key={op} style={{ flex: 1, backgroundColor: '#085041', borderRadius: 12, padding: 12 }}>
              <Text style={{ color: '#9FE1CB', fontSize: 11 }}>{op === 'MTN' ? 'MTN MoMo' : 'Airtel Money'}</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 3 }}>
                {operatorVolume(stats, op).toLocaleString('fr-FR')}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginTop: 20 }}>Transactions récentes</Text>
    </View>
  );

  if (loading) {
    return (
      <Screen title="Tableau de bord">
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  return (
    <Screen title="Tableau de bord">
      <FlatList
        data={stats?.recent ?? []}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={Hero}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.muted, marginTop: 24 }}>Aucune transaction</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }} numberOfLines={1}>{item.externalId}</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>
                  {Number(item.amount).toLocaleString('fr-FR')} <Text style={{ fontSize: 11, color: C.muted }}>{item.currency}</Text>
                </Text>
                <Pill status={item.status} />
              </View>
            </Card>
          </View>
        )}
      />
    </Screen>
  );
}
