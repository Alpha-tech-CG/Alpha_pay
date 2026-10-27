import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { ApiKeysService } from '../../src/modules/api-keys/api-keys.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

describe('T-51/T-61 API publique /v1/payments (HTTP, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
    t.providers.outbox.clear();
  });
  afterAll(async () => {
    await t.app.close();
    await prisma.$disconnect();
  });

  async function apiKey(merchantId: string, mode: 'test' | 'live' = 'test') {
    const key = await t.app.get(ApiKeysService).create(merchantId, { name: 'serveur', mode, scopes: ['payments:write', 'payments:read'] });
    return `Bearer ${key.key}`;
  }

  const body = (reference: string, extra: object = {}) => ({ amount: 5000, phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference, ...extra });

  it('crée un paiement de test (clé en Authorization: Bearer), le relit et le liste', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);

    const created = await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', randomUUID()).send(body('cmd-1')).expect(201);
    expect(created.body).toMatchObject({
      object: 'payment',
      livemode: false,
      status: 'en_attente',
      amount: 5000,
      currency: 'XAF',
      operator: 'mtn',
      reference: 'cmd-1',
    });
    expect(created.body.payer_phone).not.toContain(MOCK_MOBILE_MONEY_NUMBERS.success.slice(-6));

    const got = await a.http().get(`/v1/payments/${created.body.id}`).set('Authorization', key).expect(200);
    expect(got.body.id).toBe(created.body.id);

    const list = await a.http().get('/v1/payments?limit=10').set('Authorization', key).expect(200);
    expect(list.body).toMatchObject({ object: 'list', has_more: false, data: [{ id: created.body.id }] });
  });

  it('Idempotency-Key : même clé = même réponse, un seul paiement ; clé obligatoire', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);
    const idem = randomUUID();

    const r1 = await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', idem).send(body('cmd-2')).expect(201);
    const r2 = await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', idem).send(body('cmd-2')).expect(201);
    expect(r2.headers['idempotency-replayed']).toBe('true');
    expect(r2.body.id).toBe(r1.body.id);
    expect(await prisma.transaction.count({ where: { merchantId: owner.merchantId } })).toBe(1);

    await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', idem).send(body('cmd-3')).expect(422);
    await a.http().post('/v1/payments').set('Authorization', key).send(body('cmd-4')).expect(400);
  });

  it('validation : erreurs au format unique avec le champ en cause', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);
    const res = await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', randomUUID()).send(body('cmd-5', { amount: 10.5 })).expect(400);
    expect(res.body.error).toMatchObject({ code: 'validation_echouee', param: 'amount' });
  });

  it('mode live verrouillé tant que le KYB n’est pas approuvé : ni clé live, ni paiement live (T-61)', async () => {
    const owner = await a.signUp();
    await expect(apiKey(owner.merchantId, 'live')).rejects.toMatchObject({ status: 403 });

    // Une clé live déjà émise (KYB retiré ensuite) ne permet pas de payer en live.
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { onboardingStatus: 'APPROVED' } });
    const live = await apiKey(owner.merchantId, 'live');
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { onboardingStatus: 'PENDING' } });
    const res = await a.http().post('/v1/payments').set('Authorization', live).set('Idempotency-Key', randomUUID()).send(body('cmd-6')).expect(403);
    expect(res.body.error.code).toBe('kyb_non_valide');
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('cloisonnement : un marchand ne lit pas le paiement d’un autre ; test et live séparés', async () => {
    const m1 = await a.signUp('m1');
    const m2 = await a.signUp('m2');
    const k1 = await apiKey(m1.merchantId);
    const k2 = await apiKey(m2.merchantId);
    const created = await a.http().post('/v1/payments').set('Authorization', k1).set('Idempotency-Key', randomUUID()).send(body('cmd-7')).expect(201);

    const other = await a.http().get(`/v1/payments/${created.body.id}`).set('Authorization', k2).expect(404);
    expect(other.body.error.code).toBe('paiement_introuvable');
    expect((await a.http().get('/v1/payments').set('Authorization', k2).expect(200)).body.data).toEqual([]);

    await prisma.merchant.update({ where: { id: m1.merchantId }, data: { onboardingStatus: 'APPROVED' } });
    const live = await apiKey(m1.merchantId, 'live');
    await a.http().get(`/v1/payments/${created.body.id}`).set('Authorization', live).expect(404);
  });

  it('sans clé ou clé invalide : 401', async () => {
    await a.http().get('/v1/payments').expect(401);
    await a.http().get('/v1/payments').set('Authorization', 'Bearer pk_test_abc_def').expect(401);
  });
});
