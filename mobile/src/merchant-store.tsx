// Store back-office marchand. Mode LIVE (GET /stats via clé API marchand) avec
// repli DEMO sur les mocks (merchant-data) si non authentifié / backend injoignable.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth';
import { getStats, type Stats } from '@/api';
import {
  kpis as MOCK_KPIS, realtime as MOCK_RT, merchantTx as MOCK_TX,
  type MerchantTx,
} from '@/merchant-data';

type Kpi = { key: string; label: string; value: string; unit: string; delta: string; trend: 'up' | 'flat'; hint: string };
type Realtime = { id: string; name: string; net: 'mtn' | 'airtel'; ago: string; amount: string };

type MerchantState = {
  mode: 'live' | 'demo';
  kpis: Kpi[];
  realtime: Realtime[];
  merchantTx: MerchantTx[];
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

function maskPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? `+…${d.slice(-4)}` : (p || 'Customer');
}

function kpisFromStats(st: Stats): Kpi[] {
  const successful = st.totals.find((t) => t.status === 'SUCCESSFUL');
  const totalCount = st.totals.reduce((a, t) => a + (t.count || 0), 0);
  const okCount = successful?.count ?? 0;
  const revenue = successful?.volume ?? st.totals.reduce((a, t) => a + (t.volume || 0), 0);
  const rate = totalCount ? ((okCount / totalCount) * 100).toFixed(1) : '100.0';
  return [
    { key: 'revenue', label: 'Total Revenue', value: fmt(revenue), unit: 'XAF', delta: '', trend: 'up', hint: 'Successful volume' },
    { key: 'orders', label: 'Total Orders', value: okCount.toLocaleString('en-US'), unit: '', delta: '', trend: 'up', hint: `${totalCount} total attempts` },
    { key: 'payout', label: 'Transactions', value: totalCount.toLocaleString('en-US'), unit: '', delta: '', trend: 'flat', hint: 'All statuses' },
    { key: 'success', label: 'Success Rate', value: `${rate}%`, unit: '', delta: '', trend: 'up', hint: 'Optimal Performance' },
  ];
}

const netFromOperator = (op?: string): 'mtn' | 'airtel' => (op?.toUpperCase().includes('AIRTEL') ? 'airtel' : 'mtn');

const Ctx = createContext<MerchantState | null>(null);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [kpis, setKpis] = useState<Kpi[]>(MOCK_KPIS as Kpi[]);
  const [realtime, setRealtime] = useState<Realtime[]>(MOCK_RT);
  const [merchantTx, setMerchantTx] = useState<MerchantTx[]>(MOCK_TX);

  const refresh = useCallback(async () => {
    const st = await getStats();
    setKpis(kpisFromStats(st));
    setRealtime(
      st.recent.slice(0, 3).map((r) => ({
        id: r.id,
        name: maskPhone(r.payerPhone),
        net: netFromOperator((r as { operator?: string }).operator),
        ago: agoLabel(r.createdAt),
        amount: `+${fmt(r.amount)}`,
      })),
    );
    setMerchantTx(
      st.recent.map((r) => ({
        id: r.id,
        amount: `${fmt(r.amount)} ${r.currency ?? 'XAF'}`,
        status: r.status === 'SUCCESSFUL' ? 'succeeded' : 'failed',
        customer: maskPhone(r.payerPhone),
        network: (r as { operator?: string }).operator ?? 'Mobile Money',
        date: new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      })),
    );
    setMode('live');
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
    () => ({ mode, kpis, realtime, merchantTx, refresh }),
    [mode, kpis, realtime, merchantTx, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMerchant(): MerchantState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMerchant must be used within MerchantProvider');
  return ctx;
}
