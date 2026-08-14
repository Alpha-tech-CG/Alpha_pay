// Store back-office marchand. Mode LIVE (clé API marchand) avec repli DEMO sur
// les mocks (merchant-data) — par section, robuste aux scopes manquants (403).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth';
import {
  getStats, getSettlements, getApiKeys, getWebhookEndpoints, getWebhookDeliveries,
  type Stats, type Settlement, type ApiKeyItem, type WebhookEndpoint, type WebhookDelivery,
} from '@/api';
import {
  kpis as MOCK_KPIS, realtime as MOCK_RT, merchantTx as MOCK_TX,
  settlement as MOCK_SETTLEMENT, apiKeys as MOCK_KEYS, webhook as MOCK_WEBHOOK,
  type MerchantTx,
} from '@/merchant-data';

type Kpi = { key: string; label: string; value: string; unit: string; delta: string; trend: 'up' | 'flat'; hint: string };
type Realtime = { id: string; name: string; net: 'mtn' | 'airtel'; ago: string; amount: string };
type SettlementView = typeof MOCK_SETTLEMENT;
type ApiKeysView = typeof MOCK_KEYS;
type WebhookView = typeof MOCK_WEBHOOK;

type MerchantState = {
  mode: 'live' | 'demo';
  kpis: Kpi[];
  realtime: Realtime[];
  merchantTx: MerchantTx[];
  settlement: SettlementView;
  apiKeys: ApiKeysView;
  webhook: WebhookView;
  refresh: () => Promise<void>;
};

const fmt = (cents: number) => Math.round((cents || 0) / 100).toLocaleString('en-US');

function agoLabel(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} mins ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  return `${Math.floor(s / 86400)} days ago`;
}
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function maskPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? `+…${d.slice(-4)}` : (p || 'Customer');
}
const netFromOperator = (op?: string): 'mtn' | 'airtel' => (op?.toUpperCase().includes('AIRTEL') ? 'airtel' : 'mtn');

function kpisFromStats(st: Stats): Kpi[] {
  const successful = st.totals.find((t) => t.status === 'SUCCESSFUL');
  const totalCount = st.totals.reduce((a, t) => a + (t.count || 0), 0);
  const okCount = successful?.count ?? 0;
  const revenue = successful?.volume ?? st.totals.reduce((a, t) => a + (t.volume || 0), 0);
  const rate = totalCount ? ((okCount / totalCount) * 100).toFixed(1) : '100.0';
  return [
    { key: 'revenue', label: 'Total Revenue', value: fmt(revenue), unit: 'XAF', delta: '', trend: 'up', hint: 'Successful volume' },
    { key: 'orders', label: 'Total Orders', value: okCount.toLocaleString('en-US'), unit: '', delta: '', trend: 'up', hint: `${totalCount} attempts` },
    { key: 'payout', label: 'Transactions', value: totalCount.toLocaleString('en-US'), unit: '', delta: '', trend: 'flat', hint: 'All statuses' },
    { key: 'success', label: 'Success Rate', value: `${rate}%`, unit: '', delta: '', trend: 'up', hint: 'Optimal Performance' },
  ];
}

function settlementFromList(list: Settlement[]): SettlementView {
  const amount = (s: Settlement) => s.settledNetCents ?? s.netCents;
  const isPaid = (s: Settlement) => /PAID|COMPLET|SETTLED/i.test(s.status);
  const isFailed = (s: Settlement) => /FAIL|REJECT/i.test(s.status);
  const totalPaid = list.filter(isPaid).reduce((a, s) => a + amount(s), 0);
  const pending = list.filter((s) => !isPaid(s) && !isFailed(s)).reduce((a, s) => a + amount(s), 0);
  return {
    available: `${fmt(pending)} XAF`,
    pending: `${fmt(pending)} XAF`,
    totalPaid: `${fmt(totalPaid)} XAF`,
    history: list.slice(0, 10).map((s) => ({
      id: s.batchNumber,
      amount: `${fmt(amount(s))} ${s.settlementCurrency ?? s.currency}`,
      dest: '—',
      status: isPaid(s) ? 'Paid' : isFailed(s) ? 'Failed' : 'Pending',
      date: dateLabel(s.createdAt),
    })),
  };
}

function apiKeysFromList(keys: ApiKeyItem[]): ApiKeysView {
  const active = keys.filter((k) => !k.revoked);
  if (active.length === 0) return MOCK_KEYS;
  return { publicKey: active[0].prefix, secretKey: (active[1] ?? active[0]).prefix };
}

function webhookFromLive(endpoints: WebhookEndpoint[], deliveries: WebhookDelivery[]): WebhookView {
  if (endpoints.length === 0) return MOCK_WEBHOOK;
  const ep = endpoints[0];
  return {
    url: ep.url,
    events: ep.events.length,
    lastDelivery: deliveries[0] ? agoLabel(deliveries[0].createdAt) : '—',
    deliveries: deliveries.slice(0, 5).map((d) => ({
      id: d.id,
      code: d.responseStatus ? `${d.responseStatus} ${d.responseStatus < 400 ? 'OK' : 'ERR'}` : d.status,
      event: d.event,
      at: timeLabel(d.createdAt),
    })),
  };
}

const Ctx = createContext<MerchantState | null>(null);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [kpis, setKpis] = useState<Kpi[]>(MOCK_KPIS as Kpi[]);
  const [realtime, setRealtime] = useState<Realtime[]>(MOCK_RT);
  const [merchantTx, setMerchantTx] = useState<MerchantTx[]>(MOCK_TX);
  const [settlement, setSettlement] = useState<SettlementView>(MOCK_SETTLEMENT);
  const [apiKeys, setApiKeys] = useState<ApiKeysView>(MOCK_KEYS);
  const [webhook, setWebhook] = useState<WebhookView>(MOCK_WEBHOOK);

  const refresh = useCallback(async () => {
    const [statsR, setlR, keysR, hooksR] = await Promise.allSettled([
      getStats(), getSettlements(), getApiKeys(), getWebhookEndpoints(),
    ]);

    if (statsR.status === 'fulfilled') {
      const st = statsR.value;
      setKpis(kpisFromStats(st));
      setRealtime(st.recent.slice(0, 3).map((r) => ({
        id: r.id, name: maskPhone(r.payerPhone), net: netFromOperator((r as { operator?: string }).operator),
        ago: agoLabel(r.createdAt), amount: `+${fmt(r.amount)}`,
      })));
      setMerchantTx(st.recent.map((r) => ({
        id: r.id, amount: `${fmt(r.amount)} ${r.currency ?? 'XAF'}`,
        status: r.status === 'SUCCESSFUL' ? 'succeeded' : 'failed',
        customer: maskPhone(r.payerPhone), network: (r as { operator?: string }).operator ?? 'Mobile Money',
        date: timeLabel(r.createdAt),
      })));
    }
    if (setlR.status === 'fulfilled') setSettlement(settlementFromList(setlR.value));
    if (keysR.status === 'fulfilled') setApiKeys(apiKeysFromList(keysR.value));
    if (hooksR.status === 'fulfilled') {
      const endpoints = hooksR.value;
      let deliveries: WebhookDelivery[] = [];
      if (endpoints[0]) {
        try { deliveries = await getWebhookDeliveries(endpoints[0].id); } catch { /* scope manquant */ }
      }
      setWebhook(webhookFromLive(endpoints, deliveries));
    }

    // LIVE dès que le cœur (stats) répond ; sinon on garde DEMO.
    if (statsR.status === 'fulfilled') setMode('live');
    else throw statsR.reason;
  }, []);

  useEffect(() => {
    if (!auth.ready) return;
    if (auth.role === 'MERCHANT' && auth.apiKey) {
      refresh().catch(() => setMode('demo'));
    } else {
      setMode('demo');
    }
  }, [auth.ready, auth.role, auth.apiKey, refresh]);

  const value = useMemo<MerchantState>(
    () => ({ mode, kpis, realtime, merchantTx, settlement, apiKeys, webhook, refresh }),
    [mode, kpis, realtime, merchantTx, settlement, apiKeys, webhook, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMerchant(): MerchantState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMerchant must be used within MerchantProvider');
  return ctx;
}
