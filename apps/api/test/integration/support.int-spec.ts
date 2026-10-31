import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';
import { staffSession } from './staff';

describe('M12 Assistance et service développeur du back-office (HTTP, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;
  let hookUrl: string;
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push(body);
      res.writeHead(200).end('ok');
    });
  });

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
    hits.length = 0;
  });
  afterAll(async () => {
    server.close();
    await t.app.close();
    await prisma.$disconnect();
  });

  async function merchantWithKey() {
    const owner = await a.signUp();
    const key = (await a.http().post(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', owner.auth).send({ name: 'Serveur' }).expect(201)).body;
    return { owner, key };
  }

  it('recherche globale puis parcours complet d’un paiement ; relance opérateur par le Support, auditée', async () => {
    const { owner, key } = await merchantWithKey();
    const created = await a.http().post('/v1/payments').set('Authorization', `Bearer ${key.key}`).set('Idempotency-Key', randomUUID())
      .send({ amount: 5000, currency: 'XAF', phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference: 'cmd-support-1' }).expect(201);
    const support = await staffSession(t, 'SUPPORT');
    const h = support.headers;

    // Par référence, par numéro du payeur, par préfixe de clé.
    const byRef = await a.http().get('/internal/support/search').query({ q: 'cmd-support-1' }).set(h).expect(200);
    expect(byRef.body.payments).toEqual([expect.objectContaining({ id: created.body.id, merchant_id: owner.merchantId, status: 'PENDING' })]);
    const byPhone = await a.http().get('/internal/support/search').query({ q: MOCK_MOBILE_MONEY_NUMBERS.success }).set(h).expect(200);
    expect(byPhone.body.payments.map((p: any) => p.id)).toContain(created.body.id);
    const byKey = await a.http().get('/internal/support/search').query({ q: key.prefix }).set(h).expect(200);
    expect(byKey.body.merchants.map((m: any) => m.id)).toEqual([owner.merchantId]);

    const detail = await a.http().get(`/internal/support/payments/${created.body.id}`).set(h).expect(200);
    expect(detail.body).toMatchObject({ reference: 'cmd-support-1', status: 'PENDING', provider_reference: expect.any(String), history: expect.any(Array) });
    expect(JSON.stringify(detail.body)).not.toContain(MOCK_MOBILE_MONEY_NUMBERS.success);

    const refreshed = await a.http().post(`/internal/support/payments/${created.body.id}/refresh`).set(h).expect(200);
    expect(refreshed.body).toMatchObject({ changed: true, status: 'SUCCEEDED' });
    const after = await a.http().get(`/internal/support/payments/${created.body.id}`).set(h).expect(200);
    expect(after.body.history.at(-1)).toMatchObject({ from: 'PENDING', to: 'SUCCEEDED', reason: 'back-office : vérification opérateur' });
    expect(await prisma.auditLog.count({ where: { action: 'support.payment_refreshed', actorId: support.id, merchantId: owner.merchantId } })).toBe(1);
  });

  it('fiche développeur : clés sans secret, endpoints, livraisons renvoyées par le Support ; note d’assistance au journal', async () => {
    const { owner } = await merchantWithKey();
    const endpoint = (await a.http().post(`/v1/merchants/${owner.merchantId}/webhook-endpoints`).set('Authorization', owner.auth)
      .send({ url: hookUrl, events: ['payment.succeeded'] }).expect(201)).body;
    const tx = await prisma.transaction.create({ data: { merchantId: owner.merchantId, externalId: 'cmd-2', amount: 1000n, operator: 'MTN' } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');

    const support = await staffSession(t, 'SUPPORT');
    const dev = await a.http().get(`/internal/support/merchants/${owner.merchantId}/developers`).set(support.headers).expect(200);
    expect(dev.body.api_keys).toHaveLength(1);
    expect(JSON.stringify(dev.body)).not.toMatch(/hashedSecret|whsec_/);
    expect(dev.body.webhook_endpoints).toEqual([expect.objectContaining({ id: endpoint.id, url: hookUrl, status: 'ACTIVE' })]);
    const [delivery] = dev.body.deliveries;
    expect(delivery).toMatchObject({ event: 'payment.succeeded', status: 'PENDING' });

    const payment = await a.http().get(`/internal/support/payments/${tx.id}`).set(support.headers).expect(200);
    expect(payment.body.webhooks).toEqual([expect.objectContaining({ id: delivery.id, url: hookUrl })]);

    const resent = await a.http().post(`/internal/support/deliveries/${delivery.id}/resend`).set(support.headers).expect(200);
    expect(resent.body).toEqual({ ok: true, status: 200 });
    expect(hits).toHaveLength(1);
    await a.http().post(`/internal/support/merchants/${owner.merchantId}/webhook-endpoints/${endpoint.id}/test`).set(support.headers).expect(200);
    expect(hits).toHaveLength(2);

    await a.http().post(`/internal/support/merchants/${owner.merchantId}/notes`).set(support.headers).send({ text: 'Client appelé : webhook bloqué par son pare-feu' }).expect(201);
    const journal = await a.http().get(`/internal/support/merchants/${owner.merchantId}/audit`).set(support.headers).expect(200);
    expect(journal.body.map((r: any) => r.action)).toEqual(expect.arrayContaining(['support.note', 'support.webhook_resent', 'support.webhook_tested']));
    expect(journal.body.find((r: any) => r.action === 'support.note')).toMatchObject({ actor_name: 'Agent SUPPORT', metadata: { text: expect.stringContaining('pare-feu') } });
  });

  it('gestes de sécurité réservés à la Conformité : révoquer une clé, couper un endpoint, déconnecter un membre', async () => {
    const { owner, key } = await merchantWithKey();
    const endpoint = (await a.http().post(`/v1/merchants/${owner.merchantId}/webhook-endpoints`).set('Authorization', owner.auth).send({ url: hookUrl }).expect(201)).body;
    const team = await a.http().get(`/internal/support/merchants/${owner.merchantId}/team`).set((await staffSession(t, 'SUPPORT')).headers).expect(200);
    const [member] = team.body;
    expect(member).toMatchObject({ role: 'OWNER', active_sessions: 1, email: expect.stringContaining('***') });

    const support = await staffSession(t, 'SUPPORT');
    const base = `/internal/support/merchants/${owner.merchantId}`;
    for (const res of await Promise.all([
      a.http().post(`${base}/api-keys/${key.id}/revoke`).set(support.headers).send({ reason: 'Fuite' }),
      a.http().post(`${base}/webhook-endpoints/${endpoint.id}/status`).set(support.headers).send({ active: false, reason: 'Boucle' }),
      a.http().post(`${base}/members/${member.id}/sessions/revoke`).set(support.headers).send({ reason: 'Téléphone perdu' }),
      a.http().post('/internal/support/system/queues/messages/retry').set(support.headers).send({ reason: 'Panne' }),
    ])) expect(res.status).toBe(403);

    const compliance = await staffSession(t, 'COMPLIANCE');
    await a.http().post(`${base}/api-keys/${key.id}/revoke`).set(compliance.headers).send({}).expect(400);
    await a.http().post(`${base}/api-keys/${key.id}/revoke`).set(compliance.headers).send({ reason: 'Clé publiée sur GitHub' }).expect(200);
    await a.http().get('/v1/payments').set('Authorization', `Bearer ${key.key}`).expect(401);

    await a.http().post(`${base}/webhook-endpoints/${endpoint.id}/status`).set(compliance.headers).send({ active: false, reason: 'Endpoint en boucle' }).expect(200);
    expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } })).status).toBe('DISABLED');

    const revoked = await a.http().post(`${base}/members/${member.id}/sessions/revoke`).set(compliance.headers).send({ reason: 'Téléphone perdu' }).expect(200);
    expect(revoked.body).toEqual({ revoked: 1 });
    await a.http().get('/v1/auth/me').set('Authorization', owner.auth).expect(401);

    // Un endpoint d'un autre marchand n'est jamais accessible par ce chemin.
    const other = await a.signUp('autre');
    await a.http().post(`/internal/support/merchants/${other.merchantId}/webhook-endpoints/${endpoint.id}/status`).set(compliance.headers).send({ active: true, reason: 'Test' }).expect(404);

    const actions = (await prisma.auditLog.findMany({ where: { merchantId: owner.merchantId, actorId: compliance.id } })).map((l) => l.action).sort();
    expect(actions).toEqual(['support.api_key_revoked', 'support.member_sessions_revoked', 'support.webhook_endpoint_disabled']);
  });

  it('santé de la plateforme et journal global ; relance des files par le super-administrateur', async () => {
    const { owner } = await merchantWithKey();
    await prisma.transaction.create({ data: { merchantId: owner.merchantId, livemode: true, externalId: 'bloque', amount: 1000n, operator: 'MTN', createdAt: new Date(Date.now() - 3_600_000) } });
    const admin = await staffSession(t, 'SUPER_ADMIN');
    const system = await a.http().get('/internal/support/system').set(admin.headers).expect(200);
    expect(system.body).toMatchObject({ database: { status: 'ok' }, queues: expect.arrayContaining([expect.objectContaining({ queue: 'messages' })]) });
    expect(system.body.stuck_payments.map((p: any) => p.reference)).toEqual(['bloque']);

    const retried = await a.http().post('/internal/support/system/queues/messages/retry').set(admin.headers).send({ reason: 'Fournisseur SMS revenu' }).expect(200);
    expect(retried.body).toEqual({ retried: 0 });
    await a.http().post('/internal/support/system/queues/inconnue/retry').set(admin.headers).send({ reason: 'Test' }).expect(404);

    const audit = await a.http().get('/internal/support/audit').query({ action: 'support.' }).set(admin.headers).expect(200);
    expect(audit.body.map((r: any) => r.action)).toEqual(['support.queue_retried']);
  });
});
