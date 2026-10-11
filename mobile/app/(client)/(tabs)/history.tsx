import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, SectionList, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { BigTitle, Divider, TxLine, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet, type Transaction } from '@/wallet-store';

const FILTERS = ['Tous', 'Entrées', 'Sorties', 'Échoués'] as const;
type Filter = (typeof FILTERS)[number];
const GROUP_FR: Record<string, string> = { Today: "Aujourd'hui", Yesterday: 'Hier' };

function matchesFilter(tx: Transaction, f: Filter): boolean {
  if (f === 'Entrées') return tx.direction === 'in';
  if (f === 'Sorties') return tx.direction === 'out';
  if (f === 'Échoués') return tx.status === 'failed';
  return true;
}

export default function History() {
  const router = useRouter();
  useStatusBar('dark');
  const params = useLocalSearchParams<{ q?: string }>();
  const { transactions } = useWallet();
  const [filter, setFilter] = useState<Filter>('Tous');
  const [query, setQuery] = useState(params.q ?? '');
  useEffect(() => { setQuery(params.q ?? ''); }, [params.q]);

  const sections = useMemo(() => {
    const filtered = transactions.filter(
      (tx) => matchesFilter(tx, filter) && tx.title.toLowerCase().includes(query.toLowerCase()),
    );
    const order: string[] = [];
    const byGroup: Record<string, Transaction[]> = {};
    for (const tx of filtered) {
      const g = GROUP_FR[tx.group] ?? tx.group;
      if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
      byGroup[g].push(tx);
    }
    return order.map((title) => ({ title, data: byGroup[title] }));
  }, [transactions, filter, query]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Icon name="chevron-left" size={28} color={UC.ink} onPress={() => router.navigate('/(client)/(tabs)')} />
        <Icon name="search" size={24} color={UC.ink} onPress={() => router.push('/(client)/search-filters')} />
      </View>
      <BigTitle style={{ paddingHorizontal: 16, paddingBottom: 12 }}>Mouvements</BigTitle>

      {!!query && (
        <Pressable style={s.queryChip} onPress={() => { setQuery(''); router.setParams({ q: '' }); }}>
          <Text style={s.queryText}>« {query} »</Text>
          <Icon name="x" size={18} color={UC.white} />
        </Pressable>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsWrap}>
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Pressable key={f} style={[s.chip, active && s.chipActive]} onPress={() => setFilter(f)}>
                  <Text style={[s.chipText, active && { color: UC.white }]}>{f}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        }
        renderSectionHeader={({ section }) => (
          <View>
            <Divider />
            <Text style={s.sectionHeader}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => <TxLine tx={item} last={index === section.data.length - 1} />}
        ListEmptyComponent={<Text style={s.empty}>Aucun mouvement.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  queryChip: { alignSelf: 'flex-start', marginLeft: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: UC.teal, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6 },
  queryText: { fontFamily: ucFont.condensed, fontSize: 14, fontWeight: '700', color: UC.white },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  chipsWrap: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1, borderColor: UC.ink, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: UC.ink },
  chipText: { fontFamily: ucFont.condensed, fontSize: 14, fontWeight: '700', color: UC.ink },
  sectionHeader: { fontFamily: ucFont.condensed, fontSize: 19, fontWeight: '700', color: UC.teal, paddingTop: 18 },
  empty: { fontFamily: ucFont.regular, textAlign: 'center', color: UC.muted, marginTop: 40, fontSize: 15 },
});
