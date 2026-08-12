import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, SectionList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, formatXAF } from '@/design';
import { useWallet, type Transaction } from '@/wallet-store';

const TINT: Record<Transaction['tint'], { fg: string; bg: string }> = {
  primary: { fg: AP.primary, bg: soft.primary10 },
  secondary: { fg: AP.secondary, bg: soft.secondary10 },
  mtn: { fg: AP.mtn, bg: soft.mtn10 },
  success: { fg: AP.chart3, bg: soft.chart3_10 },
  failed: { fg: AP.chart4, bg: soft.chart4_10 },
  chart5: { fg: AP.chart5, bg: soft.chart5_10 },
};

export default function History() {
  const { transactions } = useWallet();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? transactions.filter((t) => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q))
      : transactions;
    const groups: Record<string, Transaction[]> = {};
    const order: string[] = [];
    for (const tx of filtered) {
      if (!groups[tx.group]) { groups[tx.group] = []; order.push(tx.group); }
      groups[tx.group].push(tx);
    }
    return order.map((title) => ({ title, data: groups[title] }));
  }, [transactions, query]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Transactions</Text>
        <Pressable style={s.iconBtn}>
          <Icon name="sliders-horizontal" size={18} color={AP.foreground} />
        </Pressable>
      </View>

      <View style={s.searchWrap}>
        <Icon name="search" size={18} color={AP.mutedForeground} style={s.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions..."
          placeholderTextColor={AP.mutedForeground}
          style={s.search}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<Text style={s.empty}>Aucune transaction</Text>}
        renderSectionHeader={({ section }) => <Text style={s.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => {
          const t = TINT[item.tint];
          const positive = item.direction === 'in';
          return (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={[s.rowIcon, { backgroundColor: t.bg }]}>
                  <Icon name={item.icon} size={18} color={t.fg} />
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={s.rowTitle}>{item.title}</Text>
                  <Text style={s.rowSub}>{item.subtitle}</Text>
                </View>
              </View>
              <Text style={[s.rowAmount, positive && { color: AP.chart3 }]}>
                {positive ? '+' : '-'}{formatXAF(Math.abs(item.amountCents))}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: AP.border },
  headerTitle: { fontSize: 20, fontWeight: '700', color: AP.foreground },
  iconBtn: { width: 40, height: 40, borderRadius: radius.full, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },

  searchWrap: { marginHorizontal: 20, marginTop: 20, marginBottom: 4 },
  searchIcon: { position: 'absolute', left: 16, top: 15, zIndex: 1 },
  search: { height: 48, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, paddingLeft: 44, paddingRight: 16, color: AP.foreground, fontSize: 14 },

  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: AP.mutedForeground, textTransform: 'uppercase', marginTop: 20, marginBottom: 12 },
  empty: { textAlign: 'center', color: AP.mutedForeground, marginTop: 40 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 16, marginBottom: 12 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: AP.foreground },
  rowSub: { fontSize: 10, color: AP.mutedForeground, marginTop: 6 },
  rowAmount: { fontSize: 14, fontWeight: '700', color: AP.foreground, fontVariant: ['tabular-nums'] },
});
