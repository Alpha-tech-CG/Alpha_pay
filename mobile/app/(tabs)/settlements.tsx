import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, Card } from '@/ui';
import { getSettlements, Settlement } from '@/api';
import { C } from '@/theme';

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: C.success,
  SENT: C.primary,
  INITIATED: C.muted,
  PENDING_VALIDATION: C.pending,
  FAILED: C.error,
};

function money(cents: number) {
  return (Number(cents) / 100).toLocaleString('fr-FR');
}

export default function Settlements() {
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await getSettlements()); } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Screen title="Reversements"><ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /></Screen>;

  return (
    <Screen title="Reversements">
      <FlatList
        data={rows}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.muted, marginTop: 24 }}>Aucun reversement</Text>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{item.batchNumber}</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>
                  {item.settledNetCents != null
                    ? `${money(item.settledNetCents)} ${item.settlementCurrency}`
                    : `${money(item.netCents)} ${item.currency}`}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4, color: STATUS_COLOR[item.status] ?? C.muted }}>{item.status}</Text>
              </View>
            </View>
            {item.settledNetCents != null && (
              <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                Encaissé : {money(item.netCents)} {item.currency} → converti
              </Text>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}
