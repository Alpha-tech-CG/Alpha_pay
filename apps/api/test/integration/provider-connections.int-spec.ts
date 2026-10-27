import request from 'supertest';
import { prisma } from '@paybrain/database';
import { FakeMtnServer } from '@paybrain/providers/dist/testing/fake-operator-servers';
import { MOBILE_MONEY_HTTP } from '../../src/modules/providers/mobile-money.registry';
import { MobileMoneyRegistry } from '../../src/modules/providers/mobile-money.registry';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

const MTN_CREDS = { subscriptionKey: 'SECRET-sub-1', apiUserId: 'SECRET-user-1', apiKey: 'SECRET-key-1' };
let seq = 0;

describe('M3 Comptes opérateur du marchand (HTTP, Postgres réel)', () => {
  let t: TestApp;
  const mtn = new FakeMtnServer(MTN_CREDS);
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(MOBILE_MONEY_HTTP).useValue(mtn));
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
  });
  afterAll(async () => {
    await t.app.close();
    await prisma.$disconnect();
  });

  async function signUp() {
    seq++;
    const id = { name: `Marchand ${seq}`, phone: `+24206${String(2000000 + seq).slice(-7)}`, email: `m${seq}@ops.cg`, password: 'MotDePasse2026' };
    const reg = await http().post('/v1/auth/register').send(id).expect(201);
    const res = await http().post('/v1/auth/verify').send({ challenge: reg.body.challenge, code: await t.lastCode(id.phone) }).expect(200);
    return { auth: `Bearer ${res.body.access_token}`, merchantId: res.body.user.merchants[0].id as string, userId: res.body.user.id as string };
  }

  it('connecte un compte MTN (test → sandbox), le vérifie et ne renvoie jamais les identifiants', async () => {
    const owner = await signUp();
    const base = `/v1/merchants/${owner.merchantId}/provider-connections`;

    const initial = await http().get(base).set('Authorization', owner.auth).expect(200);
    expect(initial.body.data).toHaveLength(4);
    expect(initial.body.data.every((c: any) => c.status === 'NOT_CONNECTED')).toBe(true);

    process.env.PUBLIC_API_URL = 'https://api.alphapay.test';
    const saved = await http().put(`${base}/mtn?mode=test`).set('Authorization', owner.auth).send({ credentials: MTN_CREDS }).expect(200);
    delete process.env.PUBLIC_API_URL;
    expect(saved.body).toMatchObject({ operator: 'MTN', mode: 'test', environment: 'sandbox', status: 'ACTIVE' });
    expect(saved.body.callbackUrl).toMatch(/^https:\/\/api\.alphapay\.test\/webhooks\/operators\/mtn\/[0-9a-f-]+\/[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(saved.body)).not.toContain('SECRET');

    const row = await prisma.providerConnection.findFirstOrThrow({ where: { merchantId: owner.merchantId } });
    expect(Buffer.from(row.credentialsEnc!).toString('latin1')).not.toContain('SECRET');
    expect(await prisma.auditLog.count({ where: { action: { in: ['providers.connection_saved', 'providers.connection_verified'] } } })).toBe(2);

    // Le registre utilise désormais ce compte pour un paiement live du marchand.
    await http().put(`${base}/mtn?mode=live`).set('Authorization', owner.auth).send({ credentials: MTN_CREDS }).expect(200);
    const provider = await t.app.get(MobileMoneyRegistry).forMerchant(owner.merchantId, 'MTN', true);
    expect(provider.operator).toBe('mtn');
  });

  it('identifiants refusés par l’opérateur : reste « en attente de connexion », motif clair', async () => {
    const owner = await signUp();
    const res = await http()
      .put(`/v1/merchants/${owner.merchantId}/provider-connections/mtn?mode=live`)
      .set('Authorization', owner.auth)
      .send({ credentials: { ...MTN_CREDS, apiKey: 'mauvaise' } })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'PENDING', error: { code: 'identifiants_refuses' } });
    await expect(t.app.get(MobileMoneyRegistry).forMerchant(owner.merchantId, 'MTN', true)).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('valide les champs et l’opérateur', async () => {
    const owner = await signUp();
    const base = `/v1/merchants/${owner.merchantId}/provider-connections`;
    const missing = await http().put(`${base}/airtel?mode=test`).set('Authorization', owner.auth).send({ credentials: { clientId: 'x' } }).expect(400);
    expect(missing.body.error).toMatchObject({ code: 'validation_echouee', param: 'credentials.clientSecret' });
    await http().put(`${base}/orange?mode=test`).set('Authorization', owner.auth).send({ credentials: {} }).expect(404);
    await http().put(`${base}/mtn?mode=prod`).set('Authorization', owner.auth).send({ credentials: MTN_CREDS }).expect(400);
  });

  it('déconnexion : identifiants effacés, plus utilisables', async () => {
    const owner = await signUp();
    const base = `/v1/merchants/${owner.merchantId}/provider-connections`;
    await http().put(`${base}/mtn?mode=live`).set('Authorization', owner.auth).send({ credentials: MTN_CREDS }).expect(200);
    await http().delete(`${base}/mtn?mode=live`).set('Authorization', owner.auth).expect(200);
    const row = await prisma.providerConnection.findFirstOrThrow({ where: { merchantId: owner.merchantId } });
    expect(row).toMatchObject({ status: 'DISABLED', credentialsEnc: null });
    await http().post(`${base}/mtn/verify?mode=live`).set('Authorization', owner.auth).expect(404);
  });

  it('réservé au propriétaire et aux administrateurs (contrôle serveur)', async () => {
    const a = await signUp();
    const b = await signUp();
    await http().get(`/v1/merchants/${a.merchantId}/provider-connections`).set('Authorization', b.auth).expect(403);
    await http().get(`/v1/merchants/${a.merchantId}/provider-connections`).expect(401);
    await prisma.merchantMember.updateMany({ where: { merchantId: a.merchantId, userId: a.userId }, data: { role: 'CASHIER' } });
    await http().get(`/v1/merchants/${a.merchantId}/provider-connections`).set('Authorization', a.auth).expect(403);
  });
});
