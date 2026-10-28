import { AddressInfo } from 'net';
import { prisma } from '@paybrain/database';
import { MockWebPushProvider } from '@paybrain/providers';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { WEB_PUSH } from '../../src/modules/verif/verif.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

/** Lit un flux SSE et renvoie les événements reçus (nom + données JSON). */
function openStream(baseUrl: string, ticket: string) {
  const events: { type: string; data: any; at: number }[] = [];
  const controller = new AbortController();
  const ready = (async () => {
    const res = await fetch(`${baseUrl}/v1/verif/stream?ticket=${ticket}`, { signal: controller.signal });
    if (res.status !== 200) throw new Error(`flux : HTTP ${res.status}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, i);
            buffer = buffer.slice(i + 2);
            const type = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
            const data = /^data: (.*)$/m.exec(block)?.[1];
            events.push({ type, data: data ? JSON.parse(data) : null, at: Date.now() });
          }
        }
      } catch {
        /* flux fermé */
      }
    })();
    return res.status;
  })();
  return { events, ready, close: () => controller.abort() };
}

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 4000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('délai dépassé');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('T-55 Vérif (HTTP, SSE, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;
  let baseUrl: string;
  let push: MockWebPushProvider;

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
    const server = t.app.getHttpServer();
    await new Promise<void>((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    push = t.app.get(WEB_PUSH);
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
    t.providers.outbox.clear();
    push.sent.length = 0;
  });
  afterAll(async () => {
    // Flux SSE éventuellement encore ouverts : on coupe les connexions avant l'arrêt.
    t.app.getHttpServer().closeAllConnections?.();
    await t.app.close();
    await prisma.$disconnect();
  });

  /** Marchand, boutique, deux caisses, un caissier sur la caisse 1. */
  async function setup() {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const base = `/v1/merchants/${owner.merchantId}`;
    const store = (await a.http().post(`${base}/stores`).set('Authorization', owner.auth).send({ name: 'Boutique' }).expect(201)).body;
    const till1 = (await a.http().post(`${base}/stores/${store.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 1' }).expect(201)).body;
    const till2 = (await a.http().post(`${base}/stores/${store.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 2' }).expect(201)).body;
    await a.http().post(`${base}/tills/${till1.id}/members`).set('Authorization', owner.auth).send({ memberId: cashier.memberId }).expect(201);
    return { owner, cashier, base, storeId: store.id as string, till1, till2 };
  }

  async function subscribePush(base: string, auth: string, endpoint: string) {
    await a.http().post(`${base}/verif/push-subscriptions`).set('Authorization', auth)
      .send({ endpoint, keys: { p256dh: 'BPk' + 'x'.repeat(80), auth: 'authsecret1234' } }).expect(201);
  }

  async function ticket(base: string, auth: string) {
    return (await a.http().post(`${base}/verif/stream-ticket`).set('Authorization', auth).expect(201)).body.ticket as string;
  }

  async function pay(merchantId: string, storeId: string, tillId: string, ref: string) {
    return prisma.transaction.create({
      data: { merchantId, storeId, tillId, externalId: ref, amount: 15000n, operator: 'MTN', payerPhoneMask: '+242 06 *** ** 12' },
    });
  }

  const settle = (tx: any, status: 'SUCCEEDED' | 'FAILED') =>
    t.app.get(WebhooksService).applyVerifiedStatus(tx, status, status === 'FAILED' ? 'refus_payeur' : undefined, 'test');

  it('paiement réussi : flux temps réel en moins de 5 s, web push au propriétaire et au caissier de la caisse (acceptation M5)', async () => {
    const { owner, cashier, base, storeId, till1 } = await setup();
    await subscribePush(base, owner.auth, 'https://push.example/owner');
    await subscribePush(base, cashier.auth, 'https://push.example/cashier');

    const ownerStream = openStream(baseUrl, await ticket(base, owner.auth));
    const cashierStream = openStream(baseUrl, await ticket(base, cashier.auth));
    await Promise.all([ownerStream.ready, cashierStream.ready]);
    await waitFor(() => ownerStream.events.find((e) => e.type === 'ready'));

    const tx = await pay(owner.merchantId, storeId, till1.id, 'cmd-1');
    const settledAt = Date.now();
    await settle(tx, 'SUCCEEDED');

    const evt = await waitFor(() => ownerStream.events.find((e) => e.type === 'payment'));
    expect(evt.at - settledAt).toBeLessThan(5000);
    expect(evt.data.message).toMatch(/^Paiement reçu : 15\s000\sXAF de \+242 06 \*\*\* \*\* 12, MTN, réf\. AP-[0-9A-F]{5}$/);
    expect(evt.data.payment).toMatchObject({ id: tx.id, till_id: till1.id, till_name: 'Caisse 1', amount: 15000 });
    await waitFor(() => cashierStream.events.find((e) => e.type === 'payment'));

    expect(push.sent.map((p) => p.endpoint).sort()).toEqual(['https://push.example/cashier', 'https://push.example/owner']);
    expect(push.sent[0].payload).toMatchObject({ title: 'Paiement reçu (test)', url: '/caisse' });
    ownerStream.close();
    cashierStream.close();
  });

  it('paiement échoué : aucune confirmation, ni flux, ni push, ni SMS (acceptation M5)', async () => {
    const { owner, base, storeId, till1 } = await setup();
    await a.http().patch(`${base}/tills/${till1.id}`).set('Authorization', owner.auth).send({ confirmBySms: true }).expect(200);
    await subscribePush(base, owner.auth, 'https://push.example/owner');
    const stream = openStream(baseUrl, await ticket(base, owner.auth));
    await stream.ready;

    await settle(await pay(owner.merchantId, storeId, till1.id, 'cmd-ko'), 'FAILED');
    await new Promise((r) => setTimeout(r, 300));
    await t.queue.drain('messages');

    expect(stream.events.filter((e) => e.type === 'payment')).toEqual([]);
    expect(push.sent).toEqual([]);
    expect(t.providers.outbox.sent.filter((m) => m.content.includes('Paiement reçu'))).toEqual([]);
    stream.close();
  });

  it('caissier : ne reçoit que sa caisse ; le propriétaire reçoit tout', async () => {
    const { owner, cashier, base, storeId, till2 } = await setup();
    await subscribePush(base, cashier.auth, 'https://push.example/cashier');
    const cashierStream = openStream(baseUrl, await ticket(base, cashier.auth));
    const ownerStream = openStream(baseUrl, await ticket(base, owner.auth));
    await Promise.all([cashierStream.ready, ownerStream.ready]);

    await settle(await pay(owner.merchantId, storeId, till2.id, 'cmd-2'), 'SUCCEEDED');
    await waitFor(() => ownerStream.events.find((e) => e.type === 'payment'));
    await new Promise((r) => setTimeout(r, 200));
    expect(cashierStream.events.filter((e) => e.type === 'payment')).toEqual([]);
    expect(push.sent).toEqual([]);
    cashierStream.close();
    ownerStream.close();
  });

  it('SMS/WhatsApp en option par caisse : message « Paiement reçu » au propriétaire et au caissier', async () => {
    const { owner, cashier, base, storeId, till1 } = await setup();
    await a.http().patch(`${base}/tills/${till1.id}`).set('Authorization', owner.auth).send({ confirmBySms: true }).expect(200);
    await settle(await pay(owner.merchantId, storeId, till1.id, 'cmd-3'), 'SUCCEEDED');
    await t.queue.drain('messages');
    const sms = t.providers.outbox.sent.filter((m) => m.channel === 'sms' && m.content.startsWith('Paiement reçu'));
    expect(sms.map((m) => m.to).sort()).toEqual([cashier.phone, owner.phone].sort());
    expect(sms[0].content).toMatch(/Paiement reçu : 15\s000\sXAF de \+242 06 \*\*\* \*\* 12, MTN, réf\. AP-/);
  });

  it('ticket de flux à usage unique ; écran Caisse du jour avec la mention de la limite ; abonnement expiré supprimé', async () => {
    const { owner, cashier, base, storeId, till1, till2 } = await setup();
    const tk = await ticket(base, owner.auth);
    const s1 = openStream(baseUrl, tk);
    await s1.ready;
    await expect(openStream(baseUrl, tk).ready).rejects.toThrow('HTTP 401');
    s1.close();

    await settle(await pay(owner.merchantId, storeId, till1.id, 'cmd-4'), 'SUCCEEDED');
    await settle(await pay(owner.merchantId, storeId, till2.id, 'cmd-5'), 'SUCCEEDED');
    const all = await a.http().get(`${base}/verif/today`).set('Authorization', owner.auth).expect(200);
    expect(all.body).toMatchObject({ count: 2, total: 30000, notice: expect.stringContaining('hors AlphaPay') });
    const mine = await a.http().get(`${base}/verif/today`).set('Authorization', cashier.auth).expect(200);
    expect(mine.body.data.map((p: any) => p.till_id)).toEqual([till1.id]);
    await a.http().get(`${base}/verif/today?till_id=${till2.id}`).set('Authorization', cashier.auth).expect(403);

    await subscribePush(base, owner.auth, 'https://push.example/gone');
    push.expired.add('https://push.example/gone');
    await settle(await pay(owner.merchantId, storeId, till1.id, 'cmd-6'), 'SUCCEEDED');
    expect(await prisma.webPushSubscription.count({ where: { endpoint: 'https://push.example/gone' } })).toBe(0);
  });
});
