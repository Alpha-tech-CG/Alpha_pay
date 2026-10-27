import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

describe('T-53 Page de paiement hébergée (HTTP, Postgres réel)', () => {
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

  async function till(owner: { auth: string; merchantId: string }) {
    const base = `/v1/merchants/${owner.merchantId}`;
    const store = await a.http().post(`${base}/stores`).set('Authorization', owner.auth).send({ name: 'Boutique Bacongo' }).expect(201);
    const tl = await a.http().post(`${base}/stores/${store.body.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 1' }).expect(201);
    return { base, storeId: store.body.id as string, till: tl.body };
  }

  it('QR de caisse : vue publique, paiement en mode test avant KYB, suivi par jeton signé', async () => {
    const owner = await a.signUp();
    const { storeId, till: tl } = await till(owner);

    const view = await a.http().get(`/v1/public/tills/${tl.publicCode}`).expect(200);
    expect(view.body).toMatchObject({ merchant_name: owner.name, store_name: 'Boutique Bacongo', till_name: 'Caisse 1', livemode: false, state: 'actif' });
    expect(view.body.operators.prefixes.MTN).toContain('06');

    const started = await a.http().post(`/v1/public/tills/${tl.publicCode}/pay`).send({ phone: MOCK_MOBILE_MONEY_NUMBERS.success, amount: 2500 }).expect(201);
    expect(started.body).toMatchObject({ status: 'en_attente', client_token: expect.any(String) });
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: started.body.id } });
    expect(tx).toMatchObject({ tillId: tl.id, storeId, livemode: false, amount: 2500n });

    const url = `/v1/public/payments/${started.body.id}?token=${encodeURIComponent(started.body.client_token)}`;
    expect((await a.http().get(url).expect(200)).body).toMatchObject({ status: 'en_attente', final: false });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
    const done = await a.http().get(url).expect(200);
    expect(done.body).toMatchObject({ status: 'réussi', final: true, amount: 2500, merchant_name: owner.name });
    expect(done.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(done.body)).not.toContain(MOCK_MOBILE_MONEY_NUMBERS.success.slice(-6));

    // Sans le bon jeton, rien ne fuit.
    await a.http().get(`/v1/public/payments/${started.body.id}?token=faux`).expect(404);
    await a.http().get(`/v1/public/payments/${started.body.id}`).expect(404);
  });

  it('caisse désactivée : message clair, aucun paiement ; montant invalide refusé', async () => {
    const owner = await a.signUp();
    const { base, till: tl } = await till(owner);
    await a.http().post(`/v1/public/tills/${tl.publicCode}/pay`).send({ phone: MOCK_MOBILE_MONEY_NUMBERS.success, amount: 0 }).expect(400);

    await a.http().patch(`${base}/tills/${tl.id}`).set('Authorization', owner.auth).send({ active: false }).expect(200);
    expect((await a.http().get(`/v1/public/tills/${tl.publicCode}`).expect(200)).body.state).toBe('désactivé');
    const res = await a.http().post(`/v1/public/tills/${tl.publicCode}/pay`).send({ phone: MOCK_MOBILE_MONEY_NUMBERS.success, amount: 1000 }).expect(410);
    expect(res.body.error.code).toBe('caisse_desactivee');
    expect(await prisma.transaction.count()).toBe(0);
    await a.http().get('/v1/public/tills/inconnu1').expect(404);
  });

  it('KYB approuvé : la caisse encaisse en live (compte opérateur requis)', async () => {
    const owner = await a.signUp();
    const { till: tl } = await till(owner);
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { onboardingStatus: 'APPROVED' } });
    expect((await a.http().get(`/v1/public/tills/${tl.publicCode}`).expect(200)).body.livemode).toBe(true);
    // Sans compte MTN de production connecté : refus métier clair, pas de paiement fantôme.
    const res = await a.http().post(`/v1/public/tills/${tl.publicCode}/pay`).send({ phone: '+242061234567', amount: 1000 }).expect(422);
    expect(res.body.error.code).toBe('operateur_non_connecte');
  });

  it('sert la page (HTML + script) en moins de 200 Ko, sans script en ligne', async () => {
    const html = await a.http().get('/c/abcdefgh').expect(200);
    expect(html.headers['content-type']).toMatch(/text\/html/);
    expect(html.text).toContain('<script src="/checkout/app.js"');
    expect(html.text).not.toMatch(/<script>(?!<\/script>)/);
    const js = await a.http().get('/checkout/app.js').expect(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(Buffer.byteLength(html.text) + Buffer.byteLength(js.text)).toBeLessThan(200 * 1024);
    await a.http().get('/l/abcdefgh').expect(200);
  });
});
