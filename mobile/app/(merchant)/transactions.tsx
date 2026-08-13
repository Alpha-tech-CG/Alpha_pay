import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';
import { StatusPill } from '@/dash';
import { useMerchant } from '@/merchant-store';

export default function MerchantTransactions() {
  const { merchantTx } = useMerchant();
  const [query, setQuery] = useState('');
  const data = useMemo(
    () => merchantTx.filter((t) => t.customer.toLowerCase().includes(query.toLowerCase()) || t.amount.includes(query)),
    [merchantTx, query],
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Transactions</Text>
        <Pressable style={s.exportBtn}>
          <Icon name="download" size={16} color={AP.secondary} />
          <Text style={s.exportText}>Export</Text>
        </Pressable>
      </View>

      <View style={s.searchBox}>
        <Icon name="search" size={18} color="rgba(11,30,61,0.35)" />
        <TextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder="Filter by name, email, or ID" placeholderTextColor="rgba(11,30,61,0.35)" />
      </View>

      <FlatList
        data={data}
        keyExtractor={(t) => t.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.amount}>{item.amount}</Text>
              <StatusPill label={item.status} tone={item.status === 'succeeded' ? 'ok' : 'bad'} />
            </View>
            <View style={s.metaRow}><Text style={s.metaKey}>Customer</Text><Text style={s.metaVal} numberOfLines={1}>{item.customer}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Network</Text><Text style={s.metaVal}>{item.network}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Date</Text><Text style={s.metaVal}>{item.date}</Text></View>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No transactions match.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: AP.secondary },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, ...shadow(2) },
  exportText: { fontSize: 12, fontWeight: '800', color: AP.secondary },
  searchBox: { marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: AP.secondary },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  card: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 16, gap: 10, ...shadow(2) },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  amount: { fontSize: 18, fontWeight: '900', color: AP.secondary, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metaKey: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase' },
  metaVal: { fontSize: 13, fontWeight: '600', color: AP.secondary, flexShrink: 1, textAlign: 'right' },
  empty: { textAlign: 'center', color: AP.mutedForeground, marginTop: 40, fontWeight: '600' },
});
