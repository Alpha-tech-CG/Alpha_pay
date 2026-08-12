// Store mock du portefeuille client (démo hors-ligne). État React en mémoire :
// solde, transactions, contacts, carte virtuelle — + actions qui mutent l'état
// (envoi, rechargement) pour rendre les écrans réellement interactifs.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type TxStatus = 'success' | 'failed' | 'pending';
export type TxDirection = 'in' | 'out';

export type Transaction = {
  id: string;
  title: string;
  subtitle: string;          // ex: « MTN MoMo • 14:32 »
  icon: string;              // nom d'icône (voir components/Icon)
  tint: 'primary' | 'secondary' | 'mtn' | 'success' | 'failed' | 'chart5';
  amountCents: number;       // signé : négatif = sortie
  direction: TxDirection;
  status: TxStatus;
  createdAt: number;         // timestamp ms
  group: string;             // en-tête de section (ex: « Aujourd'hui »)
};

export type Contact = {
  id: string;
  name: string;
  avatar?: string;           // URL
  initials?: string;         // repli si pas d'avatar
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
  number: string;            // masqué
  expiry: string;
  monthlyLimitCents: number;
  frozen: boolean;
  secure3d: boolean;
  onlinePayments: boolean;
};

type WalletState = {
  user: { name: string; phone: string; tag: string; avatar: string };
  balanceCents: number;
  currency: string;
  transactions: Transaction[];
  contacts: Contact[];
  topUpSources: TopUpSource[];
  card: Card;
  sendMoney: (contact: Contact, amountCents: number) => void;
  topUp: (source: TopUpSource, amountCents: number) => void;
  toggleFreeze: () => void;
  toggleCardSetting: (key: 'secure3d' | 'onlinePayments') => void;
};

const AVATAR =
  'https://lh3.googleusercontent.com/a/ACg8ocLiYBSFTKYcXZ-BjTNzJ-4KhUXVuWbDuZ14FLZIa3tdLwX9_g=s96-c';

const INITIAL_TX: Transaction[] = [
  { id: 't1', title: 'MTN MoMo Transfer', subtitle: 'MTN MoMo • 14:32', icon: 'smartphone', tint: 'mtn', amountCents: 1500000, direction: 'in', status: 'success', createdAt: Date.now(), group: "Aujourd'hui" },
  { id: 't2', title: 'Supermarché Casino', subtitle: 'AlphaPay Merchant • 09:15', icon: 'shopping-bag', tint: 'secondary', amountCents: -2450000, direction: 'out', status: 'success', createdAt: Date.now() - 86400000, group: 'Hier' },
  { id: 't3', title: 'Netflix Subscription', subtitle: 'Carte virtuelle • 18:00', icon: 'globe', tint: 'failed', amountCents: -600000, direction: 'out', status: 'failed', createdAt: Date.now() - 86400000, group: 'Hier' },
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

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balanceCents, setBalanceCents] = useState(42850000);
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

  const sendMoney = useCallback((contact: Contact, amountCents: number) => {
    if (amountCents <= 0) return;
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
        group: "Aujourd'hui",
      },
      ...list,
    ]);
  }, []);

  const topUp = useCallback((source: TopUpSource, amountCents: number) => {
    if (amountCents <= 0 || source.disabled) return;
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
        group: "Aujourd'hui",
      },
      ...list,
    ]);
  }, []);

  const toggleFreeze = useCallback(() => setCard((c) => ({ ...c, frozen: !c.frozen })), []);
  const toggleCardSetting = useCallback(
    (key: 'secure3d' | 'onlinePayments') => setCard((c) => ({ ...c, [key]: !c[key] })),
    [],
  );

  const value = useMemo<WalletState>(
    () => ({
      user: { name: 'Miche Dev', phone: '+242 06 524 8812', tag: '@michedev', avatar: AVATAR },
      balanceCents,
      currency: 'XAF',
      transactions,
      contacts: CONTACTS,
      topUpSources: SOURCES,
      card,
      sendMoney,
      topUp,
      toggleFreeze,
      toggleCardSetting,
    }),
    [balanceCents, transactions, card, sendMoney, topUp, toggleFreeze, toggleCardSetting],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
