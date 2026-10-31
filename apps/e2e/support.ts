import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { APIRequestContext, expect, Page, request } from '@playwright/test';

export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** Page de paiement hébergée (domaine de paiement en production). */
export const PAY_URL = (process.env.E2E_PAY_URL ?? API_URL).replace(/\/$/, '');
const insecure = { ignoreHTTPSErrors: !!process.env.E2E_IGNORE_HTTPS_ERRORS };
export const MAILHOG_URL = (process.env.E2E_MAILHOG_URL ?? 'http://localhost:8025').replace(/\/$/, '');
export const STAFF_FILE = join(__dirname, '.auth', 'staff.json');

/** Numéro de l'opérateur factice qui réussit (packages/providers, numéros de test documentés). */
export const MOCK_SUCCESS_PHONE = '060000001';

let seq = 0;
/** Identité unique par exécution : aucun reste d'une exécution précédente ne gêne. */
export function identity(label: string) {
  seq++;
  const n = `${Date.now()}`.slice(-6) + seq;
  return {
    name: `${label} ${n}`,
    email: `e2e.${label.toLowerCase().replace(/[^a-z]/g, '')}.${n}@alphapay.test`,
    phone: `06${String(1_000_000 + (Number(n) % 8_999_999)).padStart(7, '0')}`,
    password: `E2e-${n}-Recette!`,
  };
}

// ─── Emails (MailHog) ────────────────────────────────────────────────────────

interface MailItem {
  Created: string;
  Content: { Headers: Record<string, string[]>; Body: string };
  MIME?: { Parts?: { Body: string; Headers: Record<string, string[]> }[] };
}

function decode(body: string): string {
  // quoted-printable : =C3=A9 → é, lignes coupées « =\r\n ».
  const qp = body.replace(/=\r?\n/g, '').replace(/((?:=[0-9A-F]{2})+)/g, (m) => Buffer.from(m.replace(/=/g, ''), 'hex').toString('utf8'));
  return qp;
}

/** Attend un email reçu par `to` après `since` dont le texte vérifie `match` ; renvoie le texte. */
export async function waitForMail(to: string, match: RegExp, since = 0, timeoutMs = 60_000): Promise<string> {
  const api = await request.newContext();
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const res = await api.get(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(to)}`);
      if (res.ok()) {
        const items: MailItem[] = (await res.json()).items ?? [];
        for (const m of items) {
          if (new Date(m.Created).getTime() < since) continue;
          const text = decode(m.Content.Body) + (m.MIME?.Parts ?? []).map((p) => decode(p.Body)).join('\n');
          const subject = decode((m.Content.Headers.Subject ?? []).join(' '));
          if (match.test(text) || match.test(subject)) return `${subject}\n${text}`;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    await api.dispose();
  }
  throw new Error(`Aucun email ${match} reçu par ${to}`);
}

export async function mailCode(to: string, since: number): Promise<string> {
  const text = await waitForMail(to, /\b\d{6}\b/, since);
  return /\b(\d{6})\b/.exec(text)![1];
}

// ─── Compte marchand ─────────────────────────────────────────────────────────

/** Inscription par l'interface (code reçu par email), jusqu'au tableau de bord. */
export async function signUp(page: Page, label: string) {
  const id = identity(label);
  await page.goto('/sign-up');
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(id.name);
  await page.getByPlaceholder('06 123 45 67').fill(id.phone);
  await page.locator('input[type=email]').fill(id.email);
  await page.locator('input[type=password]').fill(id.password);
  await page.locator('form select').selectOption('email');
  const since = Date.now() - 2000;
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.getByPlaceholder('••••••').fill(await mailCode(id.email, since));
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page).toHaveURL(/\/$/);
  return id;
}

/** Jeton d'accès de la session ouverte dans la page (pour lire l'API comme l'interface). */
export async function sessionApi(page: Page) {
  const res = await page.request.post('/api/v1/auth/refresh', { headers: { 'X-AlphaPay-CSRF': '1' }, data: {} });
  expect(res.ok()).toBeTruthy();
  const token = (await res.json()).access_token as string;
  const me = await (await page.request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
  return { token, merchantId: me.merchants[0].id as string, headers: { Authorization: `Bearer ${token}` } };
}

// ─── Agent back-office (TOTP) ────────────────────────────────────────────────

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Code TOTP (RFC 6238, 30 s, 6 chiffres), comme l'application d'authentification de l'agent. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Session d'un agent super-administrateur (connexion mot de passe + TOTP). */
export async function staffApi(): Promise<APIRequestContext> {
  const { email, password, secret } = JSON.parse(readFileSync(STAFF_FILE, 'utf8'));
  const api = await request.newContext({ baseURL: API_URL, ...insecure });
  // Un même code TOTP ne sert qu'une fois (anti-rejeu) et un essai refusé clôt
  // l'étape : on recommence la connexion à la fenêtre de 30 s suivante.
  let session;
  for (let attempt = 0; attempt < 3; attempt++) {
    const step1 = await api.post('/internal/staff/login', { data: { email, password } });
    expect(step1.ok(), await step1.text()).toBeTruthy();
    const body = await step1.json();
    session = await api.post('/internal/staff/login/otp', { data: { token: body.otp_token, code: totp(secret) } });
    if (session.ok()) break;
    await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 500));
  }
  expect(session!.ok(), await session!.text()).toBeTruthy();
  const token = (await session!.json()).token as string;
  await api.dispose();
  return request.newContext({ baseURL: API_URL, ...insecure, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

/** Petit PDF valide (pièce justificative de test). */
export function pdf(title: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\n% ${title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}
