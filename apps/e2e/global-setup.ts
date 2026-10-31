import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { request } from '@playwright/test';
import { API_URL, STAFF_FILE, totp } from './support';

const COMPOSE_ARGS = (process.env.E2E_COMPOSE ?? '').split(/\s+/).filter(Boolean);

/**
 * Agent back-office de la recette. En préproduction : E2E_STAFF_EMAIL,
 * E2E_STAFF_PASSWORD et E2E_STAFF_TOTP_SECRET (compte déjà enrôlé). En local :
 * un agent super-administrateur est créé dans la pile Docker puis enrôlé
 * (code TOTP calculé comme le ferait le téléphone).
 */
export default async function globalSetup() {
  mkdirSync(dirname(STAFF_FILE), { recursive: true });
  const { E2E_STAFF_EMAIL: email, E2E_STAFF_PASSWORD: password, E2E_STAFF_TOTP_SECRET: secret } = process.env;
  if (email && password && secret) {
    writeFileSync(STAFF_FILE, JSON.stringify({ email, password, secret }));
    return;
  }

  const compose = (args: string[]) =>
    execFileSync('docker', ['compose', ...COMPOSE_ARGS, ...args], { cwd: join(__dirname, '..', '..'), encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });

  // Pile locale seulement : remet à zéro les limites de débit par IP (une recette
  // relancée plusieurs fois depuis le même poste dépasserait 60 connexions / 15 min).
  try {
    compose(['exec', '-T', 'redis', 'sh', '-c', "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del"]);
  } catch {
    // Redis protégé par mot de passe (pile de type production) : limites laissées en place.
  }

  const agent = `e2e.agent.${Date.now()}@alphapay.test`;
  const out = compose(['exec', '-T', 'api', 'node', 'dist/scripts/staff-bootstrap', agent, 'SUPER_ADMIN', 'Agent recette']);
  const pwd = /provisoire[^:]*:\s*(\S+)/.exec(out)?.[1];
  if (!pwd) throw new Error(`Agent non créé :\n${out}`);

  const api = await request.newContext({ baseURL: API_URL, ignoreHTTPSErrors: !!process.env.E2E_IGNORE_HTTPS_ERRORS });
  const step1 = await (await api.post('/internal/staff/login', { data: { email: agent, password: pwd } })).json();
  if (step1.step !== 'enroll') throw new Error(`Enrôlement attendu : ${JSON.stringify(step1)}`);
  const enrolled = await api.post('/internal/staff/login/enroll', { data: { token: step1.enroll_token, code: totp(step1.secret) } });
  if (!enrolled.ok()) throw new Error(`Enrôlement refusé : ${await enrolled.text()}`);
  await api.dispose();
  writeFileSync(STAFF_FILE, JSON.stringify({ email: agent, password: pwd, secret: step1.secret }));
}
