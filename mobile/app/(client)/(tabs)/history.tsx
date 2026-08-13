import { useMemo, useState } from 'react';
import { View, Text, Pressable, SectionList, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow, formatXAF } from '@/design';
import { useWallet, type Transaction } from '@/wallet-store';

const FILTERS = ['All Transactions', 'Payments', 'Cash In', 'Transfers'] as const;
type Filter = (typeof FILTERS)[number];

const TINT: Record<Transaction['tint'], { fg: string; bg: string }> = {
  primary: { fg: AP.primary, bg: soft.primary10 },
  secondary: { fg: AP.secondary, bg: soft.secondary10 },
  mtn: { fg: AP.mtn, bg: soft.mtn10 },
  success: { fg: AP.chart3, bg: soft.chart3_10 },
  failed: { fg: AP.chart4, bg: soft.chart4_10 },
  chart5: { fg: AP.chart5, bg: soft.chart5_10 },
};

function matchesFilter(tx: Transaction, f: Filter): boolean {
  if (f === 'All Transactions') return true;
  if (f === 'Cash In') return tx.direction === 'in';
  if (f === 'Payments') return tx.direction === 'out' && (tx.tint === 'secondary' || tx.tint === 'failed');
  if (f === 'Transfers') return tx.tint === 'primary';
  return true;
}

function statusLabel(tx: Transaction): string {
  if (tx.status === 'failed') return 'Failed';
  if (tx.status === 'pending') return 'Pending';
  return tx.direction === 'in' ? 'Settled' : 'Success';
}

function Row({ tx }: { tx: Transaction }) {
  const t = TINT[tx.tint];
  const positive = tx.direction === 'in';
  const failed = tx.status === 'failed';
  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <View style={[s.rowIcon, { backgroundColor: t.bg }]}>
          <Icon name={tx.icon} size={22} color={t.fg} />
        </View>
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Text style={s.rowTitle}>{tx.title}</Text>
          <Text style={s.rowSub}>{tx.subtitle}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[s.rowAmount, positive && { color: AP.chart3 }]}>
          {positive ? '+' : '-'}{formatXAF(Math.abs(tx.amountCents))}
        </Text>
        <Text style={[s.rowStatus, { color: failed ? AP.chart4 : AP.chart3 }]}>{statusLabel(tx)}</Text>
      </View>
    </View>
  );
}

export default function History() {
  const { transactions } = useWallet();
  const [filter, setFilter] = useState<Filter>('All Transactions');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const sections = useMemo(() => {
    const filtered = transactions.filter(
      (tx) => matchesFilter(tx, filter) && tx.title.toLowerCase().includes(query.toLowerCase()),
    );
    const order: string[] = [];
    const byGroup: Record<string, Transaction[]> = {};
    for (const tx of filtered) {
      if (!byGroup[tx.group]) { byGroup[tx.group] = []; order.push(tx.group); }
      byGroup[tx.group].push(tx);
    }
    return order.map((title) => ({ title, data: byGroup[title] }));
  }, [transactions, filter, query]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Activity</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={s.iconBtn} onPress={() => setSearching((v) => !v)}>
            <Icon name="search" size={20} color={AP.secondary} />
          </Pressable>
          <Pressable style={s.iconBtn}>
            <Icon name="sliders-horizontal" size={20} color={AP.secondary} />
          </Pressable>
        </View>
      </View>

      {searching && (
        <View style={s.searchBox}>
          <Icon name="search" size={18} color="rgba(11,30,61,0.35)" />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search transactions"
            placeholderTextColor="rgba(11,30,61,0.35)"
            autoFocus
          />
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipsWrap}
          >
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Pressable key={f} style={[s.chip, active ? s.chipActive : s.chipIdle]} onPress={() => setFilter(f)}>
                  <Text style={[s.chipText, { color: active ? '#fff' : 'rgba(11,30,61,0.6)' }]}>{f}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        }
        renderSectionHeader={({ section }) => <Text style={s.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => <Row tx={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={<Text style={s.empty}>No transactions.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: AP.secondary },
  iconBtn: { width: 44, height: 44, borderRadius: radius.xl, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },

  searchBox: { marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.lg, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: AP.secondary },

  listContent: { paddingHorizontal: 20, paddingBottom: 120 },
  chipsWrap: { flexDirection: 'row', gap: 12, paddingBottom: 20, paddingRight: 8 },
  chip: { height: 40, paddingHorizontal: 24, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: AP.secondary, ...shadow(6, AP.secondary, 0.2) },
  chipIdle: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  sectionHeader: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase', marginBottom: 12, marginTop: 8, marginLeft: 4 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxxl, padding: 20, ...shadow(2) },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  rowIcon: { width: 48, height: 48, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: AP.secondary },
  rowSub: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: AP.mutedForeground, textTransform: 'uppercase' },
  rowAmount: { fontSize: 14, fontWeight: '800', color: AP.secondary, fontVariant: ['tabular-nums'] },
  rowStatus: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },

  empty: { textAlign: 'center', color: AP.mutedForeground, marginTop: 40, fontWeight: '600' },
});
