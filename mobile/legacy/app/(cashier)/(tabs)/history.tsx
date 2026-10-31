import { useCallback, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useFocusEffect } from 'expo-router';
import { getWalletHistory, WalletTx } from '@/api';
import { useTheme, STATUS, type Palette } from '@/theme';

type IconName = string;

const txMetaFactory = (C: Palette): Record<WalletTx['type'], { icon: IconName; label: string; sign: string; color: string }> => ({
  CASH_IN:      { icon: 'add-circle',        label: 'Rechargement',    sign: '+', color: C.success },
  PAY:          { icon: 'qr-code-scanner',   label: 'Paiement reçu',   sign: '+', color: C.success },
  CASH_OUT:     { icon: 'arrow-circle-down', label: 'Retrait',         sign: '−', color: C.error },
  P2P_SEND:     { icon: 'send',              label: 'Envoi',           sign: '−', color: C.error },
  P2P_RECEIVE:  { icon: 'call-received',     label: 'Reçu',            sign: '+', color: C.success },
  REFUND:       { icon: 'replay',            label: 'Remboursement',   sign: '+', color: C.success },
});

function fmt(cents: number) {
  return (cents / 100).toLocaleString('fr-CG', { minimumFractionDigits: 0 });
}

function TxRow({ tx }: { tx: WalletTx }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const TX_META = txMetaFactory(C);
  const meta  = TX_META[tx.type] ?? TX_META['PAY'];
  const badge = STATUS[tx.status as keyof typeof STATUS] ?? STATUS.PENDING;
  const date  = new Date(tx.createdAt);
  return (
    <View style={s.row}>
      <View style={[s.iconBox, { backgroundColor: meta.color + '18' }]}>
        <Icon name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.txLabel}>{meta.label}</Text>
        {tx.description ? <Text style={s.txDesc} numberOfLines={1}>{tx.description}</Text> : null}
        <Text style={s.txDate}>{date.toLocaleDateString('fr-CG')} · {date.toLocaleTimeString('fr-CG', { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[s.txAmount, { color: meta.color }]}>
          {meta.sign}{fmt(tx.amountCents)} XAF
        </Text>
        <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[s.statusText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
    </View>
  );
}

export default function CashierHistory() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [txs, setTxs]         = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getWalletHistory(50);
      setTxs(data);
      setError(null);
    } catch {
      setError("Impossible de charger l'historique");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Historique</Text>
        <Text style={s.subtitle}>Encaissements et mouvements</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      ) : error ? (
        <View style={s.center}>
          <Icon name="error-outline" size={40} color={C.muted} />
          <Text style={s.emptyText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TxRow tx={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 48, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Icon name="receipt-long" size={48} color={C.border} />
              <Text style={s.emptyText}>Aucune transaction</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 12 },

  row: { backgroundColor: C.surface, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.border },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  txDesc: { fontSize: 12, color: C.muted, marginTop: 1 },
  txDate: { fontSize: 11, color: C.muted, marginTop: 3 },
  txAmount: { fontSize: 15, fontWeight: '800' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '700' },
});
