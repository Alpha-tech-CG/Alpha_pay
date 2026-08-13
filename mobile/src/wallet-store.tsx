// Store du portefeuille client. Deux modes :
//  - LIVE : branché sur apps/api (JWT client) — solde, transactions, P2P, cash-in réels.
//  - DEMO : données mock en mémoire (démo hors-ligne / non authentifié).
// Le mode bascule en LIVE si l'utilisateur est un CLIENT authentifié et que le
// backend répond ; sinon repli DEMO (la maquette continue de fonctionner).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth';
import {
  getWalletBalance, getWalletHistory, walletP2P, walletCashIn, type WalletTx,
} from '@/api';

export type TxStatus = 'success' | 'failed' | 'pending';
export type TxDirection = 'in' | 'out';

export type Transaction = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tint: 'primary' | 'secondary' | 'mtn' | 'success' | 'failed' | 'chart5';
  amountCents: number;       // signé : négatif = sortie
  direction: TxDirection;
  status: TxStatus;
  createdAt: number;
  group: string;
};

export type Contact = {
  id: string;
  name: string;
  avatar?: string;
  initials?: string;
  phone: string;
  network: 'mtn' | 'airtel';
};

export type TopUpSource = {
  id: string;
  name: string;
  hint: string;
  brand: 'mtn' | 'airtel' | 'card';
  disabled?: boolean;
};

export type Card = {
  brand: 'visa';
  label: string;
  holder: string;
  number: string;
  expiry: string;
  monthlyLimitCents: number;
  frozen: boolean;
  secure3d: boolean;
  onlinePayments: boolean;
};

type WalletState = {
  mode: 'live' | 'demo';
  user: { name: string; phone: string; tag: string; avatar: string };
  balanceCents: number;
  currency: string;
  transactions: Transaction[];
  contacts: Contact[];
  topUpSources: TopUpSource[];
  card: Card;
  refresh: () => Promise<void>;
  sendMoney: (contact: Contact, amountCents: number) => void;
  topUp: (source: TopUpSource, amountCents: number) => void;
  toggleFreeze: () => void;
  toggleCardSetting: (key: 'secure3d' | 'onlinePayments') => void;
};

const AVATAR =
  'https://lh3.googleusercontent.com/a/ACg8ocLiYBSFTKYcXZ-BjTNzJ-4KhUXVuWbDuZ14FLZIa3tdLwX9_g=s96-c';

const INITIAL_TX: Transaction[] = [
  { id: 't1', title: 'MTN MoMo Transfer', subtitle: 'MTN MoMo • 14:32', icon: 'smartphone', tint: 'mtn', amountCents: 1500000, direction: 'in', status: 'success', createdAt: Date.now(), group: 'Today' },
  { id: 't2', title: 'Supermarché Casino', subtitle: 'AlphaPay Merchant • 09:15', icon: 'shopping-bag', tint: 'secondary', amountCents: -2450000, direction: 'out', status: 'success', createdAt: Date.now() - 86400000, group: 'Yesterday' },
  { id: 't3', title: 'Netflix Subscription', subtitle: 'Carte virtuelle • 18:00', icon: 'globe', tint: 'failed', amountCents: -600000, direction: 'out', status: 'failed', createdAt: Date.now() - 86400000, group: 'Yesterday' },
  { id: 't4', title: 'To Junior K.', subtitle: 'Airtel Money • 14:32', icon: 'arrow-up-right', tint: 'primary', amountCents: -500000, direction: 'out', status: 'success', createdAt: Date.now() - 2 * 86400000, group: 'Oct 23' },
  { id: 't5', title: 'Wallet Top-up', subtitle: 'MTN MoMo • 09:15', icon: 'plus', tint: 'success', amountCents: 5000000, direction: 'in', status: 'success', createdAt: Date.now() - 2 * 86400000, group: 'Oct 23' },
];

const CONTACTS: Contact[] = [
  { id: 'c1', name: 'Junior K.', avatar: 'https://randomuser.me/api/portraits/men/32.jpg', phone: '+242 06 111 2233', network: 'mtn' },
  { id: 'c2', name: 'Sarah B.', avatar: 'https://randomuser.me/api/portraits/women/44.jpg', phone: '+242 06 444 5566', network: 'airtel' },
  { id: 'c3', name: 'S. Makaya', initials: 'SM', phone: '+242 06 777 8899', network: 'mtn' },
];

const SOURCES: TopUpSource[] = [
  { id: 's1', name: 'MTN MoMo', hint: 'Dépôt instantané', brand: 'mtn' },
  { id: 's2', name: 'Airtel Money', hint: 'Dépôt instantané', brand: 'airtel' },
  { id: 's3', name: 'Carte bancaire', hint: 'Visa, Mastercard (bientôt)', brand: 'card', disabled: true },
];

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function groupLabel(d: Date): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Mappe une transaction API vers le modèle d'affichage. */
function mapTx(t: WalletTx): Transaction {
  const magnitude = Math.abs(Number(t.amountCents) || 0);
  const status: TxStatus = t.status === 'SUCCESSFUL' ? 'success' : t.status === 'PENDING' ? 'pending' : 'failed';
  let direction: TxDirection = 'out';
  let icon = 'swap-horiz';
  let tint: Transaction['tint'] = 'secondary';
  let title = t.description ?? t.type;
  switch (t.type) {
    case 'CASH_IN': direction = 'in'; icon = 'plus'; tint = 'success'; title = t.description ?? 'Wallet Top-up'; break;
    case 'CASH_OUT': direction = 'out'; icon = 'arrow-up-right'; tint = 'secondary'; title = t.description ?? 'Cash-out'; break;
    case 'P2P_SEND': direction = 'out'; icon = 'arrow-up-right'; tint = 'primary'; title = t.peerPhone ? `To ${t.peerPhone}` : (t.description ?? 'Transfer'); break;
    case 'P2P_RECEIVE': direction = 'in'; icon = 'arrow-down-left'; tint = 'success'; title = t.peerPhone ? `From ${t.peerPhone}` : (t.description ?? 'Received'); break;
    case 'PAY': direction = 'out'; icon = 'shopping-bag'; tint = 'secondary'; title = t.description ?? 'Merchant Payment'; break;
    case 'REFUND': direction = 'in'; icon = 'replay'; tint = 'success'; title = t.description ?? 'Refund'; break;
  }
  const d = new Date(t.createdAt);
  return {
    id: t.id,
    title,
    subtitle: `${t.description ?? t.type.replace(/_/g, ' ')} • ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    icon,
    tint,
    amountCents: direction === 'out' ? -magnitude : magnitude,
    direction,
    status,
    createdAt: d.getTime(),
    group: groupLabel(d),
  };
}

const DEMO_USER = { name: 'Miche Dev', phone: '+242 06 524 8812', tag: '@michedev', avatar: AVATAR };

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [user, setUser] = useState(DEMO_USER);
  const [balanceCents, setBalanceCents] = useState(42850000);
  const [currency, setCurrency] = useState('XAF');
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TX);
  const [card, setCard] = useState<Card>({
    brand: 'visa',
    label: 'Virtual Debit',
    holder: 'Miche Dev',
    number: '4532 88•• ••90 4122',
    expiry: '08/28',
    monthlyLimitCents: 50000000,
    frozen: false,
    secure3d: true,
    onlinePayments: true,
  });

  const refresh = useCallback(async () => {
    const [bal, txs] = await Promise.all([getWalletBalance(), getWalletHistory(50)]);
    const fullName = bal.fullName ?? 'AlphaPay User';
    setBalanceCents(Number(bal.balanceCents) || 0);
    setCurrency(bal.currency);
    setUser((u) => ({
      ...u,
      name: fullName,
      phone: bal.phone,
      tag: '@' + bal.phone.replace(/\D/g, '').slice(-8),
    }));
    setTransactions(txs.map(mapTx));
    setCard((c) => ({ ...c, holder: fullName }));
    setMode('live');
  }, []);

  // Bascule LIVE dès qu'un CLIENT authentifié est prêt ; sinon reste en DEMO.
  useEffect(() => {
    if (!auth.ready) return;
    if (auth.role === 'CLIENT' && auth.phone) {
      refresh().catch(() => setMode('demo'));
    } else {
      setMode('demo');
    }
  }, [auth.ready, auth.role, auth.phone, refresh]);

  const sendMoney = useCallback((contact: Contact, amountCents: number) => {
    if (amountCents <= 0) return;
    if (mode === 'live') {
      walletP2P(contact.phone, amountCents, `To ${contact.name}`)
        .then(() => refresh())
        .catch((e) => console.warn('[wallet] p2p failed:', e?.message ?? e));
      return;
    }
    // DEMO
    setBalanceCents((b) => b - amountCents);
    setTransactions((list) => [
      {
        id: `tx-${Date.now()}`,
        title: `To ${contact.name}`,
        subtitle: `${contact.network === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} • ${timeLabel(Date.now())}`,
        icon: 'arrow-up-right',
        tint: 'primary',
        amountCents: -amountCents,
        direction: 'out',
        status: 'success',
        createdAt: Date.now(),
        group: 'Today',
      },
      ...list,
    ]);
  }, [mode, refresh]);

  const topUp = useCallback((source: TopUpSource, amountCents: number) => {
    if (amountCents <= 0 || source.disabled) return;
    if (mode === 'live') {
      walletCashIn(amountCents, source.brand === 'airtel' ? 'AIRTEL' : 'MTN', user.phone)
        .then(() => refresh())
        .catch((e) => console.warn('[wallet] cash-in failed:', e?.message ?? e));
      return;
    }
    // DEMO
    setBalanceCents((b) => b + amountCents);
    setTransactions((list) => [
      {
        id: `tx-${Date.now()}`,
        title: 'Wallet Top-up',
        subtitle: `${source.name} • ${timeLabel(Date.now())}`,
        icon: 'plus',
        tint: 'success',
        amountCents,
        direction: 'in',
        status: 'success',
        createdAt: Date.now(),
        group: 'Today',
      },
      ...list,
    ]);
  }, [mode, refresh, user.phone]);

  const toggleFreeze = useCallback(() => setCard((c) => ({ ...c, frozen: !c.frozen })), []);
  const toggleCardSetting = useCallback(
    (key: 'secure3d' | 'onlinePayments') => setCard((c) => ({ ...c, [key]: !c[key] })),
    [],
  );

  const value = useMemo<WalletState>(
    () => ({
      mode,
      user,
      balanceCents,
      currency,
      transactions,
      contacts: CONTACTS,
      topUpSources: SOURCES,
      card,
      refresh,
      sendMoney,
      topUp,
      toggleFreeze,
      toggleCardSetting,
    }),
    [mode, user, balanceCents, currency, transactions, card, refresh, sendMoney, topUp, toggleFreeze, toggleCardSetting],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
