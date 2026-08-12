/*
  Single source of mock data for the whole prototype (brief rule #3).
  All screens import from here — no hardcoded data inside components.
  Values reproduce the AlphaPay ClaudeCode prompt exactly where it lists them.
*/

export type TxStatus = 'confirmed' | 'pending' | 'failed' | 'refunded';
export type Operator = 'MTN' | 'Airtel' | 'USDC' | 'Card' | 'Bank';

export interface Transaction {
  id: string;
  description: string;
  counterparty: string;
  amount: number; // signed
  currency: string;
  operator: Operator;
  channel: 'sent' | 'received' | 'card' | 'international';
  status: TxStatus;
  date: string;
  reference: string;
  fee: number;
  corridor?: string;
}

/* ─────────────── STANDARD ─────────────── */

export const standardUser = {
  name: 'Miche Alpha',
  initials: 'MA',
  phone: '+242 06 123 4567',
  balance: 127500,
  currency: 'XAF',
  linked: 'MTN MoMo',
  kycLevel: 2,
  kycStatus: 'Verified',
  market: 'Congo 🇨🇬',
  alphaPayAddress: 'alphapay:cg:miche-alpha:0xA1F4',
};

// Home — Recent transactions (last 5), verbatim from the prompt.
export const recentTransactions: Transaction[] = [
  { id: 't1', description: 'Received from Jean-Pierre', counterparty: 'Jean-Pierre', amount: 25000, currency: 'XAF', operator: 'MTN', channel: 'received', status: 'confirmed', date: '2h ago', reference: 'ALP-RX-88213', fee: 0 },
  { id: 't2', description: 'Paid to Boutique Zamba', counterparty: 'Boutique Zamba', amount: -8500, currency: 'XAF', operator: 'MTN', channel: 'sent', status: 'confirmed', date: 'Yesterday', reference: 'ALP-QR-77120', fee: 100 },
  { id: 't3', description: 'International to Libya', counterparty: 'Tripoli — A. Salah', amount: -50000, currency: 'XAF', operator: 'USDC', channel: 'international', status: 'pending', date: 'Yesterday', reference: 'ALP-INTL-4410', fee: 1516, corridor: 'Congo → Libya via USDC' },
  { id: 't4', description: 'Airtel top-up', counterparty: 'Airtel', amount: 10000, currency: 'XAF', operator: 'Airtel', channel: 'received', status: 'confirmed', date: '3 days ago', reference: 'ALP-TU-3301', fee: 0 },
  { id: 't5', description: 'Card payment failed — Amazon.fr', counterparty: 'Amazon.fr', amount: 0, currency: 'XAF', operator: 'Card', channel: 'card', status: 'failed', date: '4 days ago', reference: 'ALP-CD-1120', fee: 0 },
];

// Full history (20 rows) — mix of all types.
export const historyTransactions: Transaction[] = [
  ...recentTransactions,
  { id: 't6', description: 'Received from Awa K.', counterparty: 'Awa K.', amount: 15000, currency: 'XAF', operator: 'MTN', channel: 'received', status: 'confirmed', date: 'Jul 20', reference: 'ALP-RX-88001', fee: 0 },
  { id: 't7', description: 'Paid to Pharmacie Centrale', counterparty: 'Pharmacie Centrale', amount: -6200, currency: 'XAF', operator: 'Airtel', channel: 'sent', status: 'confirmed', date: 'Jul 19', reference: 'ALP-QR-76550', fee: 100 },
  { id: 't8', description: 'Netflix subscription', counterparty: 'Netflix', amount: -15.99, currency: 'USD', operator: 'Card', channel: 'card', status: 'confirmed', date: 'Jul 18', reference: 'ALP-CD-1044', fee: 0 },
  { id: 't9', description: 'International to Libya', counterparty: 'Benghazi — M. Idris', amount: -80000, currency: 'XAF', operator: 'USDC', channel: 'international', status: 'confirmed', date: 'Jul 16', reference: 'ALP-INTL-4388', fee: 2100, corridor: 'Congo → Libya via USDC' },
  { id: 't10', description: 'Sent to Boutique Alpha', counterparty: 'Boutique Alpha', amount: -12000, currency: 'XAF', operator: 'MTN', channel: 'sent', status: 'confirmed', date: 'Jul 15', reference: 'ALP-QR-75001', fee: 100 },
  { id: 't11', description: 'Refund — Booking.com', counterparty: 'Booking.com', amount: 89.0, currency: 'EUR', operator: 'Card', channel: 'card', status: 'refunded', date: 'Jul 14', reference: 'ALP-CD-0999', fee: 0 },
  { id: 't12', description: 'Received from Papa Blaise', counterparty: 'Papa Blaise', amount: 40000, currency: 'XAF', operator: 'MTN', channel: 'received', status: 'confirmed', date: 'Jul 13', reference: 'ALP-RX-87500', fee: 0 },
  { id: 't13', description: 'AliExpress order', counterparty: 'AliExpress', amount: -8.4, currency: 'USD', operator: 'Card', channel: 'card', status: 'confirmed', date: 'Jul 12', reference: 'ALP-CD-0981', fee: 0 },
  { id: 't14', description: 'Airtel top-up', counterparty: 'Airtel', amount: 5000, currency: 'XAF', operator: 'Airtel', channel: 'received', status: 'confirmed', date: 'Jul 11', reference: 'ALP-TU-3288', fee: 0 },
  { id: 't15', description: 'Paid to Taxi Moungali', counterparty: 'Taxi Moungali', amount: -2500, currency: 'XAF', operator: 'MTN', channel: 'sent', status: 'confirmed', date: 'Jul 10', reference: 'ALP-QR-74010', fee: 50 },
  { id: 't16', description: 'International from France', counterparty: 'Paris — Cousin Théo', amount: 120000, currency: 'XAF', operator: 'USDC', channel: 'international', status: 'confirmed', date: 'Jul 9', reference: 'ALP-INTL-4290', fee: 0, corridor: 'France → Congo via USDC' },
  { id: 't17', description: 'Spotify subscription', counterparty: 'Spotify', amount: -9.99, currency: 'EUR', operator: 'Card', channel: 'card', status: 'confirmed', date: 'Jul 8', reference: 'ALP-CD-0955', fee: 0 },
  { id: 't18', description: 'Paid to Marché Total', counterparty: 'Marché Total', amount: -18000, currency: 'XAF', operator: 'Airtel', channel: 'sent', status: 'confirmed', date: 'Jul 6', reference: 'ALP-QR-73200', fee: 100 },
  { id: 't19', description: 'Card top-up from MoMo', counterparty: 'MTN MoMo', amount: 16.2, currency: 'USD', operator: 'Card', channel: 'card', status: 'confirmed', date: 'Jul 5', reference: 'ALP-CD-0940', fee: 0.5 },
  { id: 't20', description: 'Card payment declined — Steam', counterparty: 'Steam', amount: 0, currency: 'USD', operator: 'Card', channel: 'card', status: 'failed', date: 'Jul 3', reference: 'ALP-CD-0921', fee: 0 },
];

export const recentContacts = [
  { name: 'Jean-Marc Akono', phone: '+242 06 123 4567', initials: 'JA', country: '🇨🇬' },
  { name: 'Awa Kello', phone: '+242 05 776 1180', initials: 'AK', country: '🇨🇬' },
  { name: 'A. Salah', phone: '+218 91 234 5678', initials: 'AS', country: '🇱🇾' },
];

export const countries = [
  { code: 'CG', flag: '🇨🇬', name: 'Congo', dial: '+242' },
  { code: 'LY', flag: '🇱🇾', name: 'Libya', dial: '+218' },
  { code: 'FR', flag: '🇫🇷', name: 'France', dial: '+33' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium', dial: '+32' },
];

export const currencies = ['XAF', 'LYD', 'USDC', 'EUR'] as const;

/* Preferred payment source options — mobile money operators + partner banks. */
export const paymentSources = {
  operators: [
    { id: 'mtn', name: 'MTN MoMo', tag: 'Mobile Money', tint: 'warning', initials: 'MTN' },
    { id: 'airtel', name: 'Airtel Money', tag: 'Mobile Money', tint: 'destructive', initials: 'AR' },
  ],
  banks: [
    { id: 'bgfi', name: 'BGFIBank', tag: 'Congo 🇨🇬', initials: 'BG' },
    { id: 'uba', name: 'UBA', tag: 'Congo 🇨🇬', initials: 'UB' },
    { id: 'ecobank', name: 'Ecobank', tag: 'CEMAC', initials: 'EC' },
    { id: 'lybank', name: 'Sahara Bank', tag: 'Libya 🇱🇾', initials: 'SB' },
    { id: 'jumhouria', name: 'Jumhouria Bank', tag: 'Libya 🇱🇾', initials: 'JB' },
  ],
};

export const virtualCard = {
  holder: 'MICHE ALPHA',
  last4: '4821',
  pan: '4532 8814 2341 4821',
  cvv: '847',
  expiry: '08/28',
  balanceUSD: 48.5,
  network: 'Visa',
};

export const cardTransactions: Transaction[] = [
  { id: 'c1', description: 'Amazon.fr', counterparty: 'Amazon.fr', amount: -24.99, currency: 'EUR', operator: 'Card', channel: 'card', status: 'confirmed', date: 'July 20', reference: 'ALP-CD-1120', fee: 0 },
  { id: 'c2', description: 'Booking.com', counterparty: 'Booking.com', amount: -89.0, currency: 'EUR', operator: 'Card', channel: 'card', status: 'confirmed', date: 'July 15', reference: 'ALP-CD-1044', fee: 0 },
  { id: 'c3', description: 'Netflix', counterparty: 'Netflix', amount: -15.99, currency: 'USD', operator: 'Card', channel: 'card', status: 'confirmed', date: 'July 1', reference: 'ALP-CD-0990', fee: 0 },
  { id: 'c4', description: 'AliExpress', counterparty: 'AliExpress', amount: -8.4, currency: 'USD', operator: 'Card', channel: 'card', status: 'confirmed', date: 'June 28', reference: 'ALP-CD-0981', fee: 0 },
  { id: 'c5', description: 'Spotify', counterparty: 'Spotify', amount: -9.99, currency: 'EUR', operator: 'Card', channel: 'card', status: 'confirmed', date: 'June 1', reference: 'ALP-CD-0955', fee: 0 },
];

/* ─────────────── MERCHANT ─────────────── */

export const merchant = {
  business: 'Boutique Alpha',
  id: 'ALP-MC-00482',
  plan: 'Pro',
  planPrice: 5000,
  renews: 'Aug 31',
  ussd: '*150*1*00482#',
};

export const merchantKpis = {
  revenueToday: 285000,
  revenueDeltaPct: 12,
  txToday: 34,
  avgTicket: 8382,
  failedRatePct: 2.9,
};

export const revenue7Days = [
  { day: 'Mon', value: 210000 },
  { day: 'Tue', value: 265000 },
  { day: 'Wed', value: 198000 },
  { day: 'Thu', value: 312000 },
  { day: 'Fri', value: 358000 },
  { day: 'Sat', value: 402000 },
  { day: 'Sun', value: 285000 },
];

export const operatorSplit = [
  { operator: 'MTN', pct: 62, color: 'var(--chart-3)' },
  { operator: 'Airtel', pct: 38, color: 'var(--chart-1)' },
];

const merchantOps: Operator[] = ['MTN', 'Airtel'];
const merchantStatuses: TxStatus[] = ['confirmed', 'confirmed', 'confirmed', 'confirmed', 'pending', 'failed'];
export const merchantTransactions: Transaction[] = Array.from({ length: 50 }, (_, i) => {
  const amount = 1500 + ((i * 733) % 24000);
  const op = merchantOps[i % 2];
  const status = merchantStatuses[i % merchantStatuses.length];
  const fee = Math.round(amount * 0.018);
  return {
    id: `m${i + 1}`,
    description: 'QR payment',
    counterparty: `+242 0${i % 2 === 0 ? 6 : 5} ${String(100 + i).padStart(3, '0')} ${String((i * 37) % 10000).padStart(4, '0')}`,
    amount,
    currency: 'XAF',
    operator: op,
    channel: 'received' as const,
    status,
    date: `Jul ${23 - (i % 20)}, ${String(9 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
    reference: `ALP-MTX-${90000 - i}`,
    fee,
  };
});

export const terminals = [
  { id: 'ALP-T-001', name: 'Caisse principale', revenueToday: 180000 },
  { id: 'ALP-T-002', name: 'Caisse secondaire', revenueToday: 65000 },
  { id: 'ALP-T-003', name: 'Terrasse', revenueToday: 40000 },
];

export const merchantInvoices = [
  { period: 'July 2026', amount: 5000, status: 'paid', date: 'Jul 1' },
  { period: 'June 2026', amount: 5000, status: 'paid', date: 'Jun 1' },
  { period: 'May 2026', amount: 5000, status: 'paid', date: 'May 1' },
];

/* ─────────────── DEVELOPER ─────────────── */

export const developer = {
  callsToday: 142,
  callsMonth: 3847,
  callsQuota: 10000,
  errorRatePct: 1.4,
  lastCall: '4 min ago',
  plan: 'Free',
};

export const apiCalls = [
  { method: 'POST', endpoint: '/v1/payments/request', status: 202, latency: 312, ok: true },
  { method: 'GET', endpoint: '/v1/payments/abc123', status: 200, latency: 89, ok: true },
  { method: 'POST', endpoint: '/v1/payments/request', status: 422, latency: 201, ok: false, note: 'invalid phone' },
  { method: 'GET', endpoint: '/v1/settlements', status: 200, latency: 143, ok: true },
  { method: 'POST', endpoint: '/v1/cards/issue', status: 201, latency: 402, ok: true },
  { method: 'GET', endpoint: '/v1/payments/def456', status: 200, latency: 77, ok: true },
  { method: 'POST', endpoint: '/v1/webhooks/test', status: 200, latency: 120, ok: true },
  { method: 'GET', endpoint: '/v1/balance', status: 200, latency: 65, ok: true },
  { method: 'POST', endpoint: '/v1/payments/request', status: 500, latency: 890, ok: false, note: 'upstream timeout' },
  { method: 'GET', endpoint: '/v1/payments/ghi789', status: 200, latency: 91, ok: true },
];

export const apiKeys = [
  { name: 'Main key', prefix: 'alp_sk_live_7f2a…', created: 'July 1', lastUsed: '4 min ago', scopes: 'all', env: 'Production' as const },
  { name: 'CI sandbox', prefix: 'alp_sk_test_9c10…', created: 'June 12', lastUsed: '2 days ago', scopes: 'payments:read, payments:write', env: 'Sandbox' as const },
];

export const apiScopes = ['payments:read', 'payments:write', 'cards:issue', 'webhooks:manage', 'logs:read'];

export const webhook = {
  url: 'https://myapp.com/webhooks/alphapay',
  secret: 'whsec_4Kd9…f21a',
  status: 'Active',
  lastDelivery: '200 · 2 min ago',
};

export const webhookEvents = [
  { event: 'payment.confirmed', enabled: true },
  { event: 'payment.failed', enabled: true },
  { event: 'card.charged', enabled: false },
  { event: 'refund.initiated', enabled: false },
];

const evTypes = ['payment.confirmed', 'payment.failed', 'card.charged', 'refund.initiated'];
export const webhookDeliveries = Array.from({ length: 20 }, (_, i) => ({
  id: `wd${i}`,
  timestamp: `Jul 23 ${String(14 - (i % 14)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}`,
  event: evTypes[i % evTypes.length],
  code: i % 7 === 0 ? 500 : 200,
  latency: 60 + ((i * 29) % 400),
}));

const logMethods = ['GET', 'POST', 'PUT', 'DELETE'];
const logEndpoints = ['/v1/payments/request', '/v1/payments/:id', '/v1/settlements', '/v1/cards/issue', '/v1/balance', '/v1/webhooks'];
export const apiLogs = Array.from({ length: 100 }, (_, i) => {
  const codePool = [200, 200, 200, 201, 202, 400, 401, 422, 500];
  const status = codePool[i % codePool.length];
  return {
    id: `log${i}`,
    timestamp: `2026-07-23T${String(9 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}Z`,
    method: logMethods[i % logMethods.length],
    endpoint: logEndpoints[i % logEndpoints.length],
    status,
    latency: 40 + ((i * 37) % 900),
    requestId: `req_${(1000000 + i * 7).toString(36)}`,
    env: i % 3 === 0 ? 'Production' : 'Sandbox',
  };
});

export const docsSections = [
  'Authentication',
  'Payments',
  'Cards',
  'Webhooks',
  'Errors',
  'Changelog',
];
