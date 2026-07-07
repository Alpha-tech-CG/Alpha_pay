import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { getWalletHistory, WalletTx } from '@/api';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const TX_META: Record<WalletTx['type'], { icon: IconName; label: string; colorSign: 1 | -1 }> = {
  CASH_IN:      { icon: 'add-circle',           label: 'Rechargement',  colorSign: 1 },
  PAY:          { icon: 'shopping-cart',         label: 'Paiement',      colorSign: -1 },
  CASH_OUT:     { icon: 'arrow-circle-down',     label: 'Retrait',       colorSign: -1 },
  P2P_SEND:     { icon: 'send',                  label: 'Envoi',         colorSign: -1 },
  P2P_RECEIVE:  { icon: 'call-received',         label: 'Réception',     colorSign: 1 },
  REFUND:       { icon: 'replay',                label: 'Remboursement', colorSign: 1 },
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString('fr-CG', { minimumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-CG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function TxRow({ tx }: { tx: WalletTx }) {
  const meta = TX_META[tx.type];
  const positive = meta.colorSign === 1;
  return (
    <View style={s.txRow}>
      <View style={[s.txIcon, { backgroundColor: positive ? '#e6f7f6' : '#fff0f0' }]}>
        <MaterialIcons name={meta.icon} size={20} color={positive ? C.secondary : C.error} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.txLabel}>{meta.label}</Text>
        {tx.description && <Text style={s.txDesc} numberOfLines={1}>{tx.description}</Text>}
        <Text style={s.txDate}>{fmtDate(tx.createdAt)}</Text>
      </View>
      <Text style={[s.txAmount, { color: positive ? C.secondary : C.error }]}>
        {positive ? '+' : '-'}{fmt(tx.amountCents)} XAF
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const [txs, setTxs]           = useState<WalletTx[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getWalletHistory();
      setTxs(data);
      setError(null);
    } catch {
      setError("Impossible de charger l'historique");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.titleBar}>
        <Text style={s.title}>Historique</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      ) : error ? (
        <View style={s.center}>
          <MaterialIcons name="error-outline" size={36} color={C.muted} />
          <Text style={s.emptyText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={txs.length === 0 ? s.center : s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {txs.length === 0 ? (
            <>
              <MaterialIcons name="receipt-long" size={40} color={C.muted} />
              <Text style={s.emptyText}>Aucune transaction pour l'instant</Text>
            </>
          ) : (
            txs.map((tx) => <TxRow key={tx.id} tx={tx} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  titleBar: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  list: { padding: 20, gap: 2 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center' },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  txIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  txDesc: { fontSize: 12, color: C.muted, marginTop: 1 },
  txDate: { fontSize: 11, color: C.muted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
});
