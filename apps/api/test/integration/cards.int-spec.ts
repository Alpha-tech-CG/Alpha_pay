import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';
import { staffSession } from './staff';

describe('M13 Carte bancaire, remboursements et litiges (HTTP, Postgres réel, acquéreur factice)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;

  beforeAll(async () => {
    process.env.FEATURE_CARD_PAYMENTS = 'true';
    t = await createTestApp();
    a = accounts(t);
  });
  beforeEach(async () => {
    process.env.FEATURE_CARD_PAYMENTS = 'true';
    await resetDatabase();
    await t.syncTemplates();
  });
  afterAll(async () => {
    process.env.FEATURE_CARD_PAYMENTS = 'false';
    await t.app.close();
    await prisma.$disconnect();
  });

  async function merchantWithKey() {
    const owner = await a.signUp();
    const created = await a.http().post(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', owner.auth).send({ name: 'Serveur' }).expect(201);
    return { owner, key: `Bearer ${created.body.key}` };
  }

  function cardPayment(key: string, body: object = {}) {
    return a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ method: 'card', amount: 15000, reference: `cmd-${randomUUID().slice(0, 8)}`, return_url: 'https://boutique.cg/merci', ...body });
  }

  /** Le payeur saisit sa carte sur la page de l'acquéreur (factice). */
  async function payOnAcquirerPage(redirectUrl: string, pan: string, outcome = 'succeeded') {
    const path = new URL(redirectUrl).pathname;
    const page = await a.http().get(path).expect(200);
    expect(page.text.replace(/[  ]/g, ' ')).toContain('15 000 XAF');
    return a.http().post(`${path}/pay`).type('form').send({ pan, outcome }).expect(303);
  }

  it('API : paiement carte de bout en bout, sans numéro de carte chez AlphaPay ; carte refusée', async () => {
    const { key } = await merchantWithKey();
    const created = await cardPayment(key).expect(201);
    expect(created.body).toMatchObject({ payment_method: 'card', operator: 'card', status: 'en_attente', payer_phone: null, redirect_url: expect.stringContaining('/mock/card/') });

    const back = await payOnAcquirerPage(created.body.redirect_url, '4242 4242 4242 4242');
    expect(back.headers.location).toBe('https://boutique.cg/merci');
    const paid = await a.http().get(`/v1/payments/${created.body.id}`).set('Authorization', key).expect(200);
    expect(paid.body).toMatchObject({ status: 'réussi', card: { brand: 'visa', last4: '4242' }, redirect_url: null });
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain('424242424242');

    const declined = await cardPayment(key).expect(201);
    await payOnAcquirerPage(declined.body.redirect_url, '4000 0000 0000 0002');
    const failed = await a.http().get(`/v1/payments/${declined.body.id}`).set('Authorization', key).expect(200);
    expect(failed.body).toMatchObject({ status: 'échoué', failure_reason: 'CARD_DECLINED' });

    // Un webhook forgé (mauvaise signature) est refusé.
    await a.http().post('/webhooks/card/mock').send({ type: 'payment', sessionId: 'x', status: 'succeeded' }).expect(401);
    // Retour URL obligatoire pour la carte ; le téléphone ne l'est plus.
    await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', randomUUID()).send({ method: 'card', amount: 1000, reference: 'sans-retour' }).expect(400);
  });

  it('page de paiement : bouton carte sur un lien, retour vers la page qui reprend le suivi', async () => {
    const { key } = await merchantWithKey();
    const link = (await a.http().post('/v1/payment-links').set('Authorization', key).set('Idempotency-Key', randomUUID()).send({ amount: 15000, description: 'Commande 7' }).expect(201)).body;
    const view = await a.http().get(`/v1/public/links/${link.code}`).expect(200);
    expect(view.body.card).toBe(true);

    const started = await a.http().post(`/v1/public/links/${link.code}/pay-card`).send({}).expect(201);
    expect(started.body).toMatchObject({ id: expect.any(String), client_token: expect.any(String), redirect_url: expect.stringContaining('/mock/card/') });
    const back = await payOnAcquirerPage(started.body.redirect_url, '5555 5555 5555 4444');
    expect(back.headers.location).toContain(`/l/${link.code}?payment=${started.body.id}&token=`);

    const status = await a.http().get(`/v1/public/payments/${started.body.id}`).query({ token: started.body.client_token }).expect(200);
    expect(status.body).toMatchObject({ status: 'réussi', final: true, operator: 'card', card: { brand: 'mastercard', last4: '4444' } });

    // Carte désactivée sur la plateforme : aucune trace.
    process.env.FEATURE_CARD_PAYMENTS = 'false';
    expect((await a.http().get(`/v1/public/links/${link.code}`).expect(200)).body.card).toBe(false);
    await cardPayment(key).expect(400);
    await a.http().get(new URL(started.body.redirect_url).pathname).expect(404);
  });

  it('remboursements : partiel puis solde, jamais au-delà ; Mobile Money déclaré ; réservé au propriétaire', async () => {
    const { owner, key } = await merchantWithKey();
    const created = await cardPayment(key).expect(201);
    await payOnAcquirerPage(created.body.redirect_url, '4242424242424242');

    const r1 = await a.http().post(`/v1/payments/${created.body.id}/refunds`).set('Authorization', key).set('Idempotency-Key', randomUUID()).send({ amount: 5000, reason: 'Article retourné' }).expect(201);
    expect(r1.body).toMatchObject({ object: 'refund', amount: 5000, status: 'réussi', method: 'provider' });
    const over = await a.http().post(`/v1/payments/${created.body.id}/refunds`).set('Authorization', key).set('Idempotency-Key', randomUUID()).send({ amount: 20000, reason: 'Trop' }).expect(400);
    expect(over.body.error.code).toBe('montant_invalide');
    await a.http().post(`/v1/payments/${created.body.id}/refunds`).set('Authorization', key).set('Idempotency-Key', randomUUID()).send({ reason: 'Solde' }).expect(201);
    const after = await a.http().get(`/v1/payments/${created.body.id}`).set('Authorization', key).expect(200);
    expect(after.body).toMatchObject({ status: 'réussi', amount_refunded: 15000 });
    expect((await a.http().get(`/v1/payments/${created.body.id}/refunds`).set('Authorization', key).expect(200)).body.data).toHaveLength(2);

    // Mobile Money : pas d'API de remboursement chez l'opérateur → déclaration explicite.
    const momo = await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 3000, phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference: 'momo-1' }).expect(201);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: momo.body.id } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
    const needManual = await a.http().post(`/v1/merchants/${owner.merchantId}/payments/${tx.id}/refunds`).set('Authorization', owner.auth).send({ reason: 'Erreur de caisse' }).expect(422);
    expect(needManual.body.error.code).toBe('remboursement_manuel_requis');
    await a.http().post(`/v1/merchants/${owner.merchantId}/payments/${tx.id}/refunds`).set('Authorization', owner.auth).send({ reason: 'Erreur de caisse', manual: true }).expect(201);

    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    await a.http().post(`/v1/merchants/${owner.merchantId}/payments/${tx.id}/refunds`).set('Authorization', cashier.auth).send({ reason: 'Essai', manual: true }).expect(403);
    expect(await prisma.auditLog.count({ where: { merchantId: owner.merchantId, action: 'payment.refunded' } })).toBe(3);
  });

  it('litiges : ouverture par la banque, remboursement bloqué, preuves, décision ; visibles au back-office', async () => {
    const { owner, key } = await merchantWithKey();
    const created = await cardPayment(key).expect(201);
    await payOnAcquirerPage(created.body.redirect_url, '4242424242424242');
    const sessionId = new URL(created.body.redirect_url).pathname.split('/').pop();

    await a.http().post(`/mock/card/${sessionId}/dispute`).send({ reason: 'non_recu' }).expect(200);
    const [dispute] = (await a.http().get('/v1/disputes').set('Authorization', key).expect(200)).body.data;
    expect(dispute).toMatchObject({ object: 'dispute', payment_id: created.body.id, status: 'ouvert', amount: 15000, evidence_due_at: expect.any(String) });

    const blocked = await a.http().post(`/v1/payments/${created.body.id}/refunds`).set('Authorization', key).set('Idempotency-Key', randomUUID()).send({ reason: 'Essai' }).expect(409);
    expect(blocked.body.error.code).toBe('litige_en_cours');

    const sent = await a.http().post(`/v1/merchants/${owner.merchantId}/disputes/${dispute.id}/evidence`).set('Authorization', owner.auth)
      .send({ evidence: 'Commande livrée le 12/11, bon de livraison signé.' }).expect(200);
    expect(sent.body.status).toBe('en_examen');

    const ref = (await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).providerRef;
    await a.http().post(`/mock/card/${sessionId}/dispute/${ref}/close`).send({ won: true }).expect(200);
    expect((await a.http().get('/v1/disputes').set('Authorization', key).expect(200)).body.data[0].status).toBe('gagné');

    const support = await staffSession(t, 'SUPPORT');
    const detail = await a.http().get(`/internal/support/payments/${created.body.id}`).set(support.headers).expect(200);
    expect(detail.body).toMatchObject({ card: { brand: 'visa', last4: '4242' }, disputes: [expect.objectContaining({ status: 'WON' })] });
  });
});
