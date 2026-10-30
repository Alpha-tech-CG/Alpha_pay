import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { ApiKeysService } from '../../src/modules/api-keys/api-keys.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { createMerchant, resetDatabase } from './db';

describe('M11 Facturation AlphaPay (HTTP, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
    // Compte marchand d'AlphaPay (encaisse les abonnements et les packs), mode test.
    const alphapay = await createMerchant('AlphaPay SA');
    process.env.ALPHAPAY_BILLING_MERCHANT_ID = alphapay.id;
    process.env.ALPHAPAY_BILLING_LIVEMODE = 'false';
    await prisma.billingPlan.createMany({
      data: [
        { code: 'gratuit', label: 'Gratuit', priceMonthly: 0n, includedModules: [], maxStores: 1, maxTills: 1 },
        { code: 'pro', label: 'Pro', priceMonthly: 15000n, includedModules: ['m6_manage', 'm7_recover'], includedCredits: 100 },
      ],
    });
    await prisma.creditPack.create({ data: { code: 'pack-500', label: 'Pack 500', credits: 500, price: 5000n } });
  });
  afterAll(async () => {
    delete process.env.ALPHAPAY_BILLING_MERCHANT_ID;
    await t.app.close();
    await prisma.$disconnect();
  });

  /** Le marchand règle la facture AlphaPay sur la page de paiement, puis l'opérateur confirme. */
  async function pay(paymentUrl: string) {
    const code = new URL(paymentUrl).pathname.split('/').pop();
    const started = await a.http().post(`/v1/public/links/${code}/pay`).send({ phone: MOCK_MOBILE_MONEY_NUMBERS.success }).expect(201);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: started.body.id } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
    return tx;
  }

  it('pack de crédits : aucun crédit avant paiement ; crédité une seule fois au paiement réussi', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}/billing`;
    const buy = await a.http().post(`${base}/credits/purchase`).set('Authorization', owner.auth).send({ pack: 'pack-500' }).expect(200);
    expect(buy.body).toMatchObject({ status: 'en_attente_de_paiement', invoice: { kind: 'pack_credits', amount: 5000, status: 'en_attente', payment_url: expect.stringContaining('/l/') } });
    expect((await a.http().get(`${base}/credits`).set('Authorization', owner.auth)).body.balance).toBe(0);

    const tx = await pay(buy.body.invoice.payment_url);
    expect(tx.merchantId).toBe(process.env.ALPHAPAY_BILLING_MERCHANT_ID); // payé à AlphaPay, pas au marchand
    expect((await a.http().get(`${base}/credits`).set('Authorization', owner.auth)).body.balance).toBe(500);

    // Callback rejoué : pas de double crédit.
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'rejeu');
    expect((await a.http().get(`${base}/credits`).set('Authorization', owner.auth)).body.balance).toBe(500);
    const invoices = await a.http().get(`${base}/invoices`).set('Authorization', owner.auth).expect(200);
    expect(invoices.body[0]).toMatchObject({ status: 'payée', payment_url: null });
  });

  it('palier payant : module verrouillé avant paiement, ouvert après ; crédits inclus versés', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}`;
    const locked = await a.http().get(`${base}/invoices`).set('Authorization', owner.auth).expect(403);
    expect(locked.body.error.code).toBe('module_non_inclus');

    const sub = await a.http().post(`${base}/billing/subscribe`).set('Authorization', owner.auth).send({ plan: 'pro' }).expect(200);
    expect(sub.body.status).toBe('en_attente_de_paiement');
    await a.http().get(`${base}/invoices`).set('Authorization', owner.auth).expect(403); // toujours verrouillé avant paiement

    await pay(sub.body.invoice.payment_url);
    await a.http().get(`${base}/invoices`).set('Authorization', owner.auth).expect(200);
    const state = await a.http().get(`${base}/billing/subscription`).set('Authorization', owner.auth).expect(200);
    expect(state.body).toMatchObject({ plan: { code: 'pro' }, status: 'active', read_only: false });
    expect((await a.http().get(`${base}/billing/credits`).set('Authorization', owner.auth)).body.balance).toBe(100);
    const modules = await a.http().get(`${base}/billing/modules`).set('Authorization', owner.auth).expect(200);
    expect(modules.body.data.find((m: any) => m.key === 'm8_school')).toMatchObject({ allowed: false });
  });

  it('impayé : grâce, puis lecture seule ; le marchand continue de recevoir les paiements de ses clients (acceptation M11)', async () => {
    const owner = await a.signUp();
    const plan = await prisma.billingPlan.findUniqueOrThrow({ where: { code: 'pro' } });
    const ended = new Date(Date.now() - 2 * 86_400_000);
    await prisma.subscription.create({ data: { merchantId: owner.merchantId, planId: plan.id, status: 'ACTIVE', periodStart: new Date(Date.now() - 32 * 86_400_000), periodEnd: ended } });
    const billing = t.app.get(BillingService);

    await billing.runDaily();
    expect((await prisma.subscription.findUniqueOrThrow({ where: { merchantId: owner.merchantId } })).status).toBe('GRACE');
    expect(await prisma.alphapayInvoice.count({ where: { merchantId: owner.merchantId, status: 'PENDING' } })).toBe(1);

    await billing.runDaily(new Date(Date.now() + 10 * 86_400_000)); // au-delà des 7 jours de grâce
    expect((await prisma.subscription.findUniqueOrThrow({ where: { merchantId: owner.merchantId } })).status).toBe('EXPIRED');
    expect(await prisma.alphapayInvoice.count({ where: { merchantId: owner.merchantId, status: 'PENDING' } })).toBe(1); // pas de doublon

    const base = `/v1/merchants/${owner.merchantId}`;
    await a.http().get(`${base}/invoices`).set('Authorization', owner.auth).expect(200); // lecture conservée
    const ro = await a.http().post(`${base}/customers`).set('Authorization', owner.auth).send({ name: 'Client' }).expect(403);
    expect(ro.body.error.code).toBe('lecture_seule');

    // Encaissements jamais bloqués.
    const key = await t.app.get(ApiKeysService).create(owner.merchantId, { name: 'serveur', scopes: ['payments:write'] });
    await a.http().post('/v1/payments').set('Authorization', `Bearer ${key.key}`).set('Idempotency-Key', randomUUID())
      .send({ amount: 2500, phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference: 'cmd-1' }).expect(201);
  });

  it('limites du palier gratuit (une boutique, une caisse) ; seul le propriétaire achète', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const base = `/v1/merchants/${owner.merchantId}`;
    const store = await a.http().post(`${base}/stores`).set('Authorization', owner.auth).send({ name: 'Boutique 1' }).expect(201);
    await a.http().post(`${base}/stores/${store.body.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 1' }).expect(201);
    const second = await a.http().post(`${base}/stores/${store.body.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 2' }).expect(403);
    expect(second.body.error.code).toBe('limite_palier');
    await a.http().post(`${base}/stores`).set('Authorization', owner.auth).send({ name: 'Boutique 2' }).expect(403);

    await a.http().post(`${base}/billing/credits/purchase`).set('Authorization', cashier.auth).send({ pack: 'pack-500' }).expect(403);
    await a.http().get(`${base}/billing/plans`).set('Authorization', cashier.auth).expect(200);
  });
});
