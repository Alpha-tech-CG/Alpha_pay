// Données mock du back-office marchand / developer (démo hors-ligne).
export type Network = 'mtn' | 'airtel';

export const merchant = {
  business: 'Alpha Tech Congo',
  email: 'support@alphatech.cg',
  owner: 'Miche Fresneil',
  role: 'Alpha Tech CEO',
  initials: 'MF',
};

export const kpis = [
  { key: 'revenue', label: 'Total Revenue', value: '2,450,000', unit: 'XAF', delta: '+12.5%', trend: 'up' as const, hint: 'vs last month' },
  { key: 'orders', label: 'Total Orders', value: '1,842', unit: '', delta: '+5.2%', trend: 'up' as const, hint: 'vs last month' },
  { key: 'payout', label: 'Payout Balance', value: '1,980,000', unit: 'XAF', delta: '', trend: 'flat' as const, hint: 'Next payout: 28 Oct' },
  { key: 'success', label: 'Success Rate', value: '98.4%', unit: '', delta: '', trend: 'up' as const, hint: 'Optimal Performance' },
];

// Répartition hebdo (%) MTN / Airtel pour le mini-graphe.
export const revenueBars = [
  { day: 'Mon', mtn: 60, airtel: 30 },
  { day: 'Tue', mtn: 45, airtel: 45 },
  { day: 'Wed', mtn: 75, airtel: 15 },
  { day: 'Thu', mtn: 55, airtel: 35 },
  { day: 'Fri', mtn: 85, airtel: 10 },
];

export const realtime = [
  { id: 'r1', name: 'Jean Bakoula', net: 'mtn' as Network, ago: '2 mins ago', amount: '+15,000' },
  { id: 'r2', name: 'Sarah Loko', net: 'airtel' as Network, ago: '15 mins ago', amount: '+42,000' },
  { id: 'r3', name: 'Bob Wang', net: 'mtn' as Network, ago: '1 hour ago', amount: '+5,000' },
];

export type MerchantTx = {
  id: string;
  amount: string;
  status: 'succeeded' | 'failed';
  customer: string;
  network: string;
  date: string;
};

export const merchantTx: MerchantTx[] = [
  { id: 'm1', amount: '15,000 XAF', status: 'succeeded', customer: 'junior.k@email.com', network: 'MTN MoMo', date: 'Oct 25, 14:32' },
  { id: 'm2', amount: '42,500 XAF', status: 'failed', customer: 'unknown@guest.com', network: 'Airtel Money', date: 'Oct 25, 12:15' },
  { id: 'm3', amount: '8,000 XAF', status: 'succeeded', customer: 'sarah.b@gmail.com', network: 'MTN MoMo', date: 'Oct 24, 18:45' },
];

export type PayLink = {
  id: string;
  title: string;
  detail: string;
  status: 'active' | 'disabled';
  totalPaid: string;
};

export const payLinks: PayLink[] = [
  { id: 'p1', title: 'Donation for Schools', detail: 'Flexible amount • XAF', status: 'active', totalPaid: '1,240,000 XAF' },
  { id: 'p2', title: 'Standard Monthly Sub', detail: '15,000 XAF • XAF', status: 'disabled', totalPaid: '0 XAF' },
];

export const apiKeys = {
  publicKey: 'pk_live_51P8vBqL3k7mN9e4rT2xW',
  secretKey: 'sk_live_v9X2p4Z1r8M5wL0qT7yC',
};

export const webhook = {
  url: 'https://api.yourshop.com/v1/webhooks/alphapay',
  events: 6,
  lastDelivery: '2 mins ago',
  deliveries: [
    { id: 'd1', code: '200 OK', event: 'payment.succeeded', at: 'Today, 14:32:01' },
    { id: 'd2', code: '200 OK', event: 'payment.succeeded', at: 'Today, 14:28:45' },
  ],
};

export const settlement = {
  available: '470,000 XAF',
  pending: '125,400 XAF',
  totalPaid: '15,800,000 XAF',
  history: [
    { id: 'PAY-882-019', amount: '1,400,000 XAF', dest: 'Ecobank **** 4412', status: 'Paid', date: 'Oct 20, 2024' },
    { id: 'PAY-882-018', amount: '950,000 XAF', dest: 'Ecobank **** 4412', status: 'Paid', date: 'Oct 13, 2024' },
  ],
};

export const team = [
  { id: 'u1', name: 'Miche Fresneil', role: 'Owner', badge: 'Admin', initials: 'MF' },
  { id: 'u2', name: 'Sarah Mayaka', role: 'Finance Manager', badge: '', avatar: 'https://randomuser.me/api/portraits/women/65.jpg' },
];

// Logs sandbox (developer).
export const sandboxLogs = [
  { id: 'l1', time: '14:32:01.884', code: '200 POST', method: '/v1/payments/create', ms: '156ms', ok: true, body: '{ "id": "test_pay_9921", "status": "succeeded", "method": "mtn_momo" }' },
  { id: 'l2', time: '14:31:55.201', code: '200 POST', method: '/v1/customers/create', ms: '88ms', ok: true, body: '' },
  { id: 'l3', time: '14:28:10.450', code: '400 POST', method: '/v1/payments/create', ms: '45ms', ok: false, body: '{ "error": "insufficient_funds", "code": "card_declined" }' },
];
