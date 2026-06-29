import axios from 'axios';
import Constants from 'expo-constants';

const baseURL =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'http://localhost:3000';

export const api = axios.create({ baseURL, timeout: 15000 });

/** Pose (ou retire) la clé API marchand sur toutes les requêtes. */
export function setApiKey(key: string | null) {
  if (key) api.defaults.headers.common['X-API-Key'] = key;
  else delete api.defaults.headers.common['X-API-Key'];
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
