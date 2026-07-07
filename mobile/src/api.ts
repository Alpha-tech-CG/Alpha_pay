import axios from 'axios';
import Constants from 'expo-constants';

const baseURL =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'http://localhost:3000';

export const api = axios.create({ baseURL, timeout: 15000 });

/** Pose la clé API marchand (X-API-Key) et retire le Bearer JWT si présent. */
export function setApiKey(key: string | null) {
  if (key) api.defaults.headers.common['X-API-Key'] = key;
  else delete api.defaults.headers.common['X-API-Key'];
  // Les marchands n'utilisent pas Bearer
  delete api.defaults.headers.common['Authorization'];
}

/** Pose le JWT client (Authorization: Bearer) et retire X-API-Key si présent. */
export function setBearerToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
  // Les clients wallet n'utilisent pas X-API-Key
  delete api.defaults.headers.common['X-API-Key'];
}

/** Vérifie une clé en appelant un endpoint protégé léger. */
export async function verifyKey(key: string): Promise<boolean> {
  try {
    await api.get('/stats', { headers: { 'X-API-Key': key } });
    return true;
  } catch {
    return false;
  }
}

export interface Stats {
  totals: { status: string; count: number; volume: number }[];
  byOperator: { operator: string; count: number; volume: number }[];
  recent: {
    id: string;
    externalId: string;
    amount: number;
    currency: string;
    status: string;
    payerPhone: string;
    createdAt: string;
  }[];
}

export const getStats = () => api.get<Stats>('/stats').then((r) => r.data);

export const createPaylink = (body: {
  amount: number;
  currency: string;
  description: string;
  expiresInMinutes?: number;
}) => api.post('/paylinks', body).then((r) => r.data);

export interface Settlement {
  id: string;
  batchNumber: string;
  currency: string;
  netCents: number;
  settlementCurrency: string | null;
  settledNetCents: number | null;
  status: string;
  createdAt: string;
}

export const getSettlements = () => api.get<Settlement[]>('/v1/settlements').then((r) => r.data);

/** Enregistre le token Expo Push côté serveur pour recevoir les alertes paiement. */
export const registerPushToken = (token: string) =>
  api.post('/v1/push-tokens', { token, platform: 'expo' }).then((r) => r.data);

export interface SignupPayload {
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  country?: string;
  type: 'MERCHANT' | 'DEVELOPER';
}

/**
 * Inscription via le site web — l'app ouvre la page d'inscription Clerk
 * dans le navigateur natif. On ne gère pas les credentials en mobile.
 */
export const SIGNUP_URL =
  (Constants.expoConfig?.extra as { dashboardUrl?: string } | undefined)?.dashboardUrl
    ? `${(Constants.expoConfig.extra as { dashboardUrl: string }).dashboardUrl}/sign-up`
    : 'https://dashboard.paybrain.cg/sign-up';

/* ─── CLIENT (Wallet) API ─── */

export interface WalletBalance {
  balanceCents: number;
  currency: string;
  phone: string;
  fullName: string | null;
}

export interface WalletTx {
  id: string;
  type: 'CASH_IN' | 'PAY' | 'CASH_OUT' | 'P2P_SEND' | 'P2P_RECEIVE' | 'REFUND';
  amountCents: number;
  balanceAfter: number;
  status: string;
  description: string | null;
  createdAt: string;
  merchantId?: string;
  peerPhone?: string;
}

/** Connexion client par téléphone + PIN → renvoie { token, phone, role } */
export const loginClient = (phone: string, pin: string) =>
  api.post<{ token: string; phone: string; role: string }>(
    '/v1/wallet/auth/login',
    { phone, pin },
  ).then((r) => r.data);

/** Inscription client — crée le wallet avec le PIN choisi par l'utilisateur */
export const registerClient = (phone: string, fullName: string, pin: string) =>
  api.post<{ ok: boolean; phone: string }>(
    '/v1/wallet/auth/register',
    { phone, fullName, pin },
  ).then((r) => r.data);

/** Solde et info du wallet */
export const getWalletBalance = () =>
  api.get<WalletBalance>('/v1/wallet/balance').then((r) => r.data);

/** Historique des transactions du wallet */
export const getWalletHistory = (limit = 30) =>
  api.get<WalletTx[]>('/v1/wallet/transactions', { params: { limit } }).then((r) => r.data);

/** Initier un rechargement (Cash-In) via Mobile Money */
export const walletCashIn = (amountCents: number, operator: string, phone: string) =>
  api.post('/v1/wallet/cash-in', { amountCents, operator, phone }).then((r) => r.data);

/** Clé d'idempotence : un retry réseau ou double-tap renvoie la transaction d'origine. */
export const genIdemKey = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;

/** Payer un marchand via QR code signé */
export const walletPay = (qrPayload: string, idempotencyKey?: string) =>
  api.post('/v1/wallet/pay', { qrPayload, idempotencyKey }).then((r) => r.data);

/** Génère un QR marchand signé côté serveur — compte caissier uniquement (ALP-172) */
export const walletCreateQr = (amountCents: number, description?: string) =>
  api.post<{ ok: boolean; qrPayload: string; expiresAt: string }>(
    '/v1/wallet/qr',
    { amountCents, ...(description ? { description } : {}) },
  ).then((r) => r.data);

/** Retrait (Cash-Out) vers Mobile Money */
export const walletCashOut = (amountCents: number, operator: string, phone: string) =>
  api.post('/v1/wallet/cash-out', { amountCents, operator, phone }).then((r) => r.data);

/** Transfert P2P vers un autre numéro */
export const walletP2P = (toPhone: string, amountCents: number, description?: string) =>
  api.post('/v1/wallet/p2p', { toPhone, amountCents, description }).then((r) => r.data);
