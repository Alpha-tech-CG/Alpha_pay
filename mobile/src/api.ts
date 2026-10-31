// Client de l'API AlphaPay V1 (routes du tableau de bord, `/v1/auth`, `/v1/merchants/:id/…`).
// Jeton d'accès (15 min) en mémoire seulement ; jeton de rafraîchissement dans le
// stockage sécurisé de l'appareil (Keystore Android), jamais dans un cookie.
import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; dashboardUrl?: string };
export const API_URL = extra.apiBaseUrl ?? 'http://localhost:3000';
export const DASHBOARD_URL = extra.dashboardUrl ?? 'http://localhost:5173';

const REFRESH_KEY = 'alphapay_refresh_token';

const publicApi = axios.create({ baseURL: API_URL, timeout: 20000 });
export const api = axios.create({ baseURL: API_URL, timeout: 20000 });

let accessToken: string | null = null;
let refreshing: Promise<string> | null = null;
let onSessionLost: () => void = () => {};

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

type Tokens = { access_token: string; refresh_token: string };

async function storeTokens(t: Tokens) {
  accessToken = t.access_token;
  await SecureStore.setItemAsync(REFRESH_KEY, t.refresh_token);
}

export async function clearTokens() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

/** Renouvelle le jeton d'accès ; un seul appel à la fois (le jeton tourne à chaque usage). */
export function refreshAccessToken(): Promise<string> {
  refreshing ??= (async () => {
    const stored = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!stored) throw new Error('aucune session');
    try {
      const res = await publicApi.post<Tokens>('/v1/auth/refresh', { refresh_token: stored });
      await storeTokens(res.data);
      return res.data.access_token;
    } catch (err) {
      // Session refusée par l'API : on l'oublie. Panne réseau : on la garde.
      if ((err as AxiosError).response?.status === 401) await clearTokens();
      throw err;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
  if (error.response?.status === 401 && original && !original._retried) {
    original._retried = true;
    try {
      await refreshAccessToken();
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      accessToken = null;
      onSessionLost();
    }
  }
  return Promise.reject(error);
});

/** Message lisible depuis le format d'erreur unique de l'API (§7). */
export function errorMessage(err: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  const e = err as AxiosError<{ error?: { message?: string } }>;
  if (e?.response?.data?.error?.message) return e.response.data.error.message;
  if (e?.code === 'ECONNABORTED' || e?.message === 'Network Error') return 'Serveur injoignable. Vérifiez votre connexion.';
  return fallback;
}

export function errorCode(err: unknown): string | undefined {
  return (err as AxiosError<{ error?: { code?: string } }>)?.response?.data?.error?.code;
}

/* ─── Authentification ─── */

export type Role = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'CASHIER';

export interface Membership {
  id: string;
  name: string;
  role: Role;
  kybStatus: string;
}

export interface Me {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  merchants: Membership[];
}

export interface Challenge {
  challenge: string;
  channel: string;
  to?: string;
  expires_in: number;
}

export type OtpChannel = 'sms' | 'whatsapp' | 'email';

export const login = (identifier: string, password: string, channel?: OtpChannel) =>
  publicApi.post<Challenge>('/v1/auth/login', { identifier, password, ...(channel ? { channel } : {}) }).then((r) => r.data);

export const register = (body: { name: string; phone: string; email: string; password: string; channel?: OtpChannel }) =>
  publicApi.post<Challenge>('/v1/auth/register', body).then((r) => r.data);

export async function verifyCode(challenge: string, code: string): Promise<Me> {
  const res = await publicApi.post<Tokens & { user: Me }>('/v1/auth/verify', { challenge, code, client: 'mobile' });
  await storeTokens(res.data);
  return res.data.user;
}

export const forgotPassword = (identifier: string, channel?: OtpChannel) =>
  publicApi.post<Challenge>('/v1/auth/password/forgot', { identifier, ...(channel ? { channel } : {}) }).then((r) => r.data);

export const resetPassword = (challenge: string, code: string, password: string) =>
  publicApi.post('/v1/auth/password/reset', { challenge, code, password }).then((r) => r.data);

export const getMe = () => api.get<Me>('/v1/auth/me').then((r) => r.data);

export async function logout() {
  try {
    if (accessToken) await api.post('/v1/auth/logout');
  } finally {
    await clearTokens();
  }
}

/** Au démarrage : une session enregistrée sur l'appareil est-elle encore valable ? */
export async function restoreSession(): Promise<Me | null> {
  const stored = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!stored) return null;
  await refreshAccessToken();
  return getMe();
}

/* ─── Données marchand ─── */

export type Mode = 'live' | 'test';

export interface List<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export type PaymentStatus = 'en_attente' | 'réussi' | 'échoué' | 'expiré' | 'annulé';

export interface Payment {
  id: string;
  livemode: boolean;
  status: PaymentStatus;
  amount: number;
  currency: string;
  amount_display: string;
  operator: string;
  payment_method: 'mobile_money' | 'card';
  payer_phone: string | null;
  card: { brand: string | null; last4: string | null } | null;
  amount_refunded: number;
  reference: string | null;
  description: string | null;
  failure_reason: string | null;
  provider_reference: string | null;
  till_id: string | null;
  created_at: string;
}

export interface Refund {
  id: string;
  status: string;
  amount: number;
  amount_display: string;
  method: string;
  reason: string | null;
  created_at: string;
}

export interface PaymentDetail extends Payment {
  refunds: Refund[];
  disputes: { id: string; status: string; reason: string | null; amount: number; evidence_due_at: string | null; created_at: string }[];
  can_refund: boolean;
  audit_trail: { from: string | null; to: string; reason: string | null; at: string }[];
}

export interface PeriodStats {
  succeeded_count: number;
  succeeded_volume: number;
  succeeded_volume_display: string;
  failed_count: number;
  total_count: number;
}

export interface Stats {
  day: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  by_operator: { operator: string; count: number; volume: number; volume_display: string }[];
}

export interface Summary {
  today: { count: number; amount: number; display: string };
  all_time: { count: number; amount: number; display: string };
}

export interface Till {
  id: string;
  name: string;
  publicCode: string;
  url: string;
  store: { id: string; name: string };
}

export interface PaymentLink {
  id: string;
  livemode: boolean;
  url: string;
  code: string;
  amount: number | null;
  currency: string;
  description: string;
  multi_use: boolean;
  state: string;
  payments_succeeded: number;
  expires_at: string | null;
  created_at: string;
  share: { whatsapp: string; sms: string };
}

export interface Member {
  id: string;
  role: Role;
  status: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
}

const base = (merchantId: string) => `/v1/merchants/${merchantId}`;

export const getStats = (m: string, mode: Mode) => api.get<Stats>(`${base(m)}/stats`, { params: { mode } }).then((r) => r.data);

export const getSummary = (m: string, mode: Mode) =>
  api.get<Summary>(`${base(m)}/payments/summary`, { params: { mode } }).then((r) => r.data);

export const getPayments = (
  m: string,
  mode: Mode,
  filters: { status?: string; till_id?: string; q?: string; limit?: number; starting_after?: string } = {},
) => api.get<List<Payment>>(`${base(m)}/payments`, { params: { mode, ...filters } }).then((r) => r.data);

export const getPayment = (m: string, id: string) => api.get<PaymentDetail>(`${base(m)}/payments/${id}`).then((r) => r.data);

export const refundPayment = (m: string, mode: Mode, id: string, body: { amount?: number; reason: string; manual?: boolean }) =>
  api.post<Refund>(`${base(m)}/payments/${id}/refunds`, body, { params: { mode } }).then((r) => r.data);

export const getMyTills = (m: string) => api.get<{ data: Till[] }>(`${base(m)}/tills/mine`).then((r) => r.data.data);

export const getLinks = (m: string, mode: Mode) =>
  api.get<List<PaymentLink>>(`${base(m)}/payment-links`, { params: { mode, limit: 50 } }).then((r) => r.data);

export const createLink = (m: string, mode: Mode, body: { amount?: number; description: string; multi_use?: boolean }) =>
  api.post<PaymentLink>(`${base(m)}/payment-links`, body, { params: { mode } }).then((r) => r.data);

export const deactivateLink = (m: string, mode: Mode, id: string) =>
  api.post<PaymentLink>(`${base(m)}/payment-links/${id}/deactivate`, {}, { params: { mode } }).then((r) => r.data);

export const sendLink = (m: string, mode: Mode, id: string, phone: string, channel: 'whatsapp' | 'sms') =>
  api.post(`${base(m)}/payment-links/${id}/send`, { phone, channel }, { params: { mode } }).then((r) => r.data);

export const getMembers = (m: string) => api.get<Member[] | { data: Member[] }>(`${base(m)}/members`).then((r) => (Array.isArray(r.data) ? r.data : r.data.data));
