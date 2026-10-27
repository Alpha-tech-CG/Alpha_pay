import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { ApiKeysService } from '../../src/modules/api-keys/api-keys.service';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

describe('T-52 Liens de paiement (HTTP, Postgres réel)', () => {
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

  async function apiKey(merchantId: string) {
    const key = await t.app.get(ApiKeysService).create(merchantId, { name: 'serveur', scopes: ['paylinks:write', 'paylinks:read'] });
    return `Bearer ${key.key}`;
  }

  const phone = MOCK_MOBILE_MONEY_NUMBERS.success;

  /** Marque un paiement réussi comme le ferait un callback opérateur vérifié. */
  async function succeed(id: string) {
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
  }

  it('API : crée un lien à montant fixe, le relit, le liste ; page publique puis paiement', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);
    const created = await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 15000, description: 'Commande 1042' }).expect(201);
    expect(created.body).toMatchObject({ object: 'payment_link', amount: 15000, currency: 'XAF', multi_use: false, state: 'actif' });
    expect(created.body.url).toMatch(new RegExp(`/l/${created.body.code}$`));
    expect(decodeURIComponent(created.body.share.whatsapp)).toContain(created.body.url);
    expect(created.body.share.sms).toMatch(/^sms:/);

    await a.http().get(`/v1/payment-links/${created.body.id}`).set('Authorization', key).expect(200);
    const list = await a.http().get('/v1/payment-links').set('Authorization', key).expect(200);
    expect(list.body.data).toHaveLength(1);

    const view = await a.http().get(`/v1/public/links/${created.body.code}`).expect(200);
    expect(view.body).toMatchObject({ merchant_name: owner.name, amount: 15000, state: 'actif' });

    const paid = await a.http().post(`/v1/public/links/${created.body.code}/pay`).send({ phone }).expect(201);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: paid.body.id } });
    expect(tx).toMatchObject({ paymentLinkId: created.body.id, amount: 15000n, merchantId: owner.merchantId });
  });

  it('usage unique : un paiement en cours bloque un second ; une fois payé, « déjà utilisé » sans appel opérateur', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);
    const link = (await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 2000, description: 'Unique' }).expect(201)).body;

    const first = await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone }).expect(201);
    const busy = await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone }).expect(409);
    expect(busy.body.error.code).toBe('paiement_en_cours');

    await succeed(first.body.id);
    const used = await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone }).expect(410);
    expect(used.body.error).toMatchObject({ code: 'lien_deja_utilise', message: expect.stringContaining('déjà été payé') });
    expect((await a.http().get(`/v1/public/links/${link.code}`).expect(200)).body.state).toBe('utilisé');
    expect(await prisma.transaction.count()).toBe(1);
    expect((await prisma.paymentLink.findUniqueOrThrow({ where: { id: link.id } })).usedAt).not.toBeNull();
  });

  it('usage multiple et montant libre : chaque payeur saisit son montant', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);
    const link = (await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ description: 'Cotisation', multi_use: true }).expect(201)).body;
    expect(link.amount).toBeNull();

    const missing = await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone }).expect(400);
    expect(missing.body.error.param).toBe('amount');
    const p1 = await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone, amount: 1000 }).expect(201);
    await succeed(p1.body.id);
    await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone, amount: 2500 }).expect(201);
    const got = await a.http().get(`/v1/payment-links/${link.id}`).set('Authorization', key).expect(200);
    expect(got.body).toMatchObject({ state: 'actif', payments_succeeded: 1 });
  });

  it('lien expiré ou désactivé : message clair, aucun paiement initié (acceptation M4)', async () => {
    const owner = await a.signUp();
    const key = await apiKey(owner.merchantId);
    const past = await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 500, description: 'x', expires_at: new Date(Date.now() - 60_000).toISOString() }).expect(400);
    expect(past.body.error.param).toBe('expires_at');

    const link = (await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 500, description: 'Expirant', expires_at: new Date(Date.now() + 60_000).toISOString() }).expect(201)).body;
    await prisma.paymentLink.update({ where: { id: link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await a.http().post(`/v1/public/links/${link.code}/pay`).send({ phone }).expect(410);
    expect(expired.body.error.code).toBe('lien_expire');
    expect((await a.http().get(`/v1/public/links/${link.code}`).expect(200)).body.message).toContain('expiré');

    const other = (await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 500, description: 'Désactivé' }).expect(201)).body;
    await a.http().post(`/v1/payment-links/${other.id}/deactivate`).set('Authorization', key).expect(200);
    const off = await a.http().post(`/v1/public/links/${other.code}/pay`).send({ phone }).expect(410);
    expect(off.body.error.code).toBe('lien_desactive');

    expect(await prisma.transaction.count()).toBe(0);
    await a.http().get('/v1/public/links/inexistant').expect(404);
  });

  it('tableau de bord : le propriétaire crée et envoie par WhatsApp ; le caissier ne crée pas ; actions auditées', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const base = `/v1/merchants/${owner.merchantId}/payment-links`;

    const link = (await a.http().post(base).set('Authorization', owner.auth).send({ amount: 7000, description: 'Facture 7' }).expect(201)).body;
    await a.http().post(base).set('Authorization', cashier.auth).send({ amount: 1, description: 'x' }).expect(403);

    await a.http().post(`${base}/${link.id}/send`).set('Authorization', owner.auth).send({ phone: '+242061112233' }).expect(202);
    await t.queue.drain('messages');
    const sent = t.providers.outbox.sent.find((m) => m.to === '+242061112233');
    expect(sent).toBeDefined();
    expect(sent!.variables?.join(' ') ?? sent!.content).toContain(link.url);

    const list = await a.http().get(base).set('Authorization', owner.auth).expect(200);
    expect(list.body.data.map((l: any) => l.id)).toEqual([link.id]);
    expect(await prisma.auditLog.count({ where: { action: 'paylinks.link_created', targetId: link.id } })).toBe(1);
  });
});
