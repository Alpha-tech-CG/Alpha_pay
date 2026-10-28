import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { verifyAlphaPaySignature } from '../../src/common/security/hmac';
import { WebhookDeliveryWorker } from '../../src/modules/webhooks-out/webhook-delivery.worker';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

/** Serveur du marchand qui reçoit les webhooks ; `failNext` simule une panne. */
function merchantServer() {
  const received: { headers: IncomingMessage['headers']; body: string }[] = [];
  const state = { failNext: 0 };
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      if (state.failNext > 0) {
        state.failNext--;
        res.writeHead(500).end('panne');
      } else res.writeHead(200).end('ok');
    });
  });
  return { server, received, state };
}

describe('M10 Développeurs : clés, journal, limites, webhooks signés (HTTP, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;
  const hook = merchantServer();
  let hookUrl: string;

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
    await new Promise<void>((r) => hook.server.listen(0, '127.0.0.1', r));
    hookUrl = `http://127.0.0.1:${(hook.server.address() as AddressInfo).port}/alphapay`;
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
    t.providers.outbox.clear();
    hook.received.length = 0;
    hook.state.failNext = 0;
    delete process.env.API_KEY_RATE_LIMIT_PER_MIN;
  });
  afterAll(async () => {
    hook.server.close();
    await t.app.close();
    await prisma.$disconnect();
  });

  function createKey(owner: { auth: string; merchantId: string }, body: object = {}) {
    return a.http().post(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', owner.auth).send({ name: 'Serveur', ...body });
  }

  it('clé ap_test_ créée depuis le tableau de bord, secret affiché une seule fois ; live refusé sans KYB ; audit', async () => {
    const owner = await a.signUp();
    const created = await createKey(owner).expect(201);
    expect(created.body.key).toMatch(/^ap_test_[0-9a-f]{8}_[A-Za-z0-9_-]{20,}$/);

    const list = await a.http().get(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', owner.auth).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(created.body.key.split('_').pop());
    expect(list.body.data[0]).toMatchObject({ prefix: created.body.prefix, revoked: false });

    const live = await createKey(owner, { mode: 'live' }).expect(403);
    expect(live.body.error.code).toBe('kyb_non_valide');

    await a.http().delete(`/v1/merchants/${owner.merchantId}/api-keys/${created.body.id}`).set('Authorization', owner.auth).expect(200);
    await a.http().get('/v1/payments').set('Authorization', `Bearer ${created.body.key}`).expect(401);
    expect(await prisma.auditLog.count({ where: { action: { in: ['developers.api_key_created', 'developers.api_key_revoked'] } } })).toBe(2);
  });

  it('un caissier ou un comptable ne gère pas les clés ; un développeur oui', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const dev = await a.inviteAndJoin(owner, 'DEVELOPER', 'dev');
    await a.http().get(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', cashier.auth).expect(403);
    await a.http().post(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', dev.auth).send({ name: 'CI' }).expect(201);
  });

  it('journal des requêtes API (métadonnées seulement) et en-têtes RateLimit-* ; 429 au-delà de la limite par clé', async () => {
    const owner = await a.signUp();
    const key = `Bearer ${(await createKey(owner).expect(201)).body.key}`;
    process.env.API_KEY_RATE_LIMIT_PER_MIN = '3';

    const ok = await a.http().get('/v1/payments').set('Authorization', key).expect(200);
    expect(ok.headers['ratelimit-limit']).toBe('3');
    expect(ok.headers['ratelimit-remaining']).toBe('2');
    expect(Number(ok.headers['ratelimit-reset'])).toBeGreaterThan(0);
    await a.http().post('/v1/payments').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ amount: 10.5, phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference: 'x' }).expect(400);
    await a.http().get(`/v1/payments/${randomUUID()}`).set('Authorization', key).expect(404);
    const limited = await a.http().get('/v1/payments').set('Authorization', key).expect(429);
    expect(limited.body.error.code).toBe('trop_de_requetes');
    expect(limited.headers['retry-after']).toBeDefined();

    await new Promise((r) => setTimeout(r, 200)); // écriture du journal à la fin de la réponse
    const logs = await a.http().get(`/v1/merchants/${owner.merchantId}/api-logs`).set('Authorization', owner.auth).expect(200);
    expect(logs.body.retention_days).toBe(30);
    expect(logs.body.data.map((l: any) => `${l.method} ${l.path} ${l.status} ${l.error_code ?? ''}`.trim())).toEqual([
      'GET /v1/payments 429 trop_de_requetes',
      'GET /v1/payments/:id 404 paiement_introuvable',
      'POST /v1/payments 400 validation_echouee',
      'GET /v1/payments 200',
    ]);
    expect(JSON.stringify(logs.body)).not.toContain(MOCK_MOBILE_MONEY_NUMBERS.success);
    const errors = await a.http().get(`/v1/merchants/${owner.merchantId}/api-logs?status=errors`).set('Authorization', owner.auth).expect(200);
    expect(errors.body.data).toHaveLength(3);
  });

  it('webhook payment.succeeded signé (AlphaPay-Signature), enveloppe standard, relance après panne puis renvoi manuel', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}`;
    const endpoint = (await a.http().post(`${base}/webhook-endpoints`).set('Authorization', owner.auth)
      .send({ url: hookUrl, events: ['payment.succeeded'] }).expect(201)).body;
    expect(endpoint.secret).toMatch(/^whsec_/);

    const tx = await prisma.transaction.create({
      data: { merchantId: owner.merchantId, externalId: 'cmd-9', amount: 15000n, operator: 'MTN', payerPhoneMask: '+242 06 *** ** 12' },
    });
    hook.state.failNext = 1;
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
    const worker = t.app.get(WebhookDeliveryWorker);
    await worker.processPending();

    // 1re tentative en échec (500) : nouvelle tentative programmée dans 1 min.
    const [delivery] = (await a.http().get(`${base}/webhook-endpoints/${endpoint.id}/deliveries`).set('Authorization', owner.auth).expect(200)).body.data;
    expect(delivery).toMatchObject({ event: 'payment.succeeded', status: 'PENDING', attempts: 1, responseStatus: 500 });
    expect(new Date(delivery.nextRetryAt).getTime() - Date.now()).toBeGreaterThan(50_000);

    // Renvoi manuel depuis le tableau de bord : livré, signature valide, même événement.
    const resent = await a.http().post(`${base}/webhook-endpoints/${endpoint.id}/deliveries/${delivery.id}/resend`).set('Authorization', owner.auth).expect(200);
    expect(resent.body).toEqual({ ok: true, status: 200 });
    expect(hook.received).toHaveLength(2);
    const [first, second] = hook.received;
    expect(first.body).toBe(second.body);
    const sig = String(second.headers['alphapay-signature']);
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyAlphaPaySignature(endpoint.secret, sig, second.body)).toBe(true);
    expect(second.headers['alphapay-event']).toBe('payment.succeeded');

    const event = JSON.parse(second.body);
    expect(event).toMatchObject({ object: 'event', type: 'payment.succeeded', livemode: false, data: { object: { id: tx.id, object: 'payment', status: 'réussi', amount: 15000, currency: 'XAF', reference: 'cmd-9' } } });
    expect(event.id).toMatch(/^evt_[0-9a-f]{32}$/);
    expect(second.body).not.toContain('payerPhoneEnc');
    expect(await prisma.auditLog.count({ where: { action: 'developers.webhook_resent' } })).toBe(1);
  });

  it('webhook message.failed quand un message de l’API échoue sur tous ses canaux ; URL live non publique refusée', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}`;
    await a.http().post(`${base}/webhook-endpoints`).set('Authorization', owner.auth).send({ url: hookUrl, events: ['message.failed'] }).expect(201);
    const key = `Bearer ${(await createKey(owner).expect(201)).body.key}`;

    t.providers.outbox.failing.add('+242069998877');
    await a.http().post('/v1/messages').set('Authorization', key).set('Idempotency-Key', randomUUID())
      .send({ channel: 'sms', to: '+242069998877', text: 'Bonjour' }).expect((r) => expect([201, 202]).toContain(r.status));
    await t.queue.drain('messages');
    await t.app.get(WebhookDeliveryWorker).processPending();
    const failed = hook.received.map((r) => JSON.parse(r.body)).find((e) => e.type === 'message.failed');
    expect(failed?.data.object).toMatchObject({ object: 'message', channel: 'sms', status: 'échoué' });

    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { onboardingStatus: 'APPROVED' } });
    const bad = await a.http().post(`${base}/webhook-endpoints?mode=live`).set('Authorization', owner.auth).send({ url: 'http://127.0.0.1/x' }).expect(400);
    expect(bad.body.error.code).toBe('url_webhook_invalide');
  });

  it('portail développeurs : /docs/openapi.json sert la spécification 3.1 avec le guide FR', async () => {
    const spec = await a.http().get('/docs/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.info.description).toContain('# Vérifier la signature'.replace('# ', '## '));
    expect(spec.body.paths['/v1/payments'].post).toBeDefined();
  });
});
