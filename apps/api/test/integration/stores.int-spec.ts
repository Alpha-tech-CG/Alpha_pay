import { prisma } from '@paybrain/database';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

describe('T-50 Boutiques, caisses et caissiers (HTTP, Postgres réel)', () => {
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

  /** Boutique avec deux caisses ; renvoie les identifiants. */
  async function storeWithTills(owner: { auth: string; merchantId: string }) {
    const base = `/v1/merchants/${owner.merchantId}`;
    const store = await a.http().post(`${base}/stores`).set('Authorization', owner.auth).send({ name: 'Boutique Poto-Poto', address: 'Av. de la Paix' }).expect(201);
    const t1 = await a.http().post(`${base}/stores/${store.body.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 1' }).expect(201);
    const t2 = await a.http().post(`${base}/stores/${store.body.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 2' }).expect(201);
    return { base, storeId: store.body.id as string, till1: t1.body, till2: t2.body };
  }

  async function payment(merchantId: string, storeId: string, tillId: string, externalId: string) {
    return prisma.transaction.create({
      data: { merchantId, storeId, tillId, externalId, amount: 5000n, payerPhoneMask: '+242 06 *** ** 12' },
    });
  }

  it('crée boutique et caisses ; chaque caisse a un code public unique ; actions auditées', async () => {
    const owner = await a.signUp();
    const { base, till1, till2 } = await storeWithTills(owner);
    expect(till1.publicCode).toMatch(/^[a-z2-9]{8}$/);
    expect(till1.publicCode).not.toBe(till2.publicCode);

    const list = await a.http().get(`${base}/stores`).set('Authorization', owner.auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].tills.map((x: any) => x.name).sort()).toEqual(['Caisse 1', 'Caisse 2']);

    await a.http().patch(`${base}/tills/${till1.id}`).set('Authorization', owner.auth).send({ confirmBySms: true }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['stores.store_created', 'stores.till_created', 'stores.till_updated'] } } })).toBe(4);
  });

  it('un caissier ne gère pas les boutiques', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    await a.http().get(`/v1/merchants/${owner.merchantId}/stores`).set('Authorization', cashier.auth).expect(403);
    await a.http().post(`/v1/merchants/${owner.merchantId}/stores`).set('Authorization', cashier.auth).send({ name: 'X' }).expect(403);
  });

  it('un caissier ne voit QUE les paiements de sa caisse (acceptation M1)', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const { base, storeId, till1, till2 } = await storeWithTills(owner);
    await payment(owner.merchantId, storeId, till1.id, 'cmd-1');
    await payment(owner.merchantId, storeId, till2.id, 'cmd-2');

    // Sans caisse rattachée : aucun accès aux paiements.
    await a.http().get(`${base}/payments`).set('Authorization', cashier.auth).expect(403);

    await a.http().post(`${base}/tills/${till1.id}/members`).set('Authorization', owner.auth).send({ memberId: cashier.memberId }).expect(201);
    const mine = await a.http().get(`${base}/tills/mine`).set('Authorization', cashier.auth).expect(200);
    expect(mine.body.data.map((x: any) => x.id)).toEqual([till1.id]);
    expect(mine.body.data[0].url).toMatch(/\/c\/[a-z0-9]+$/);

    const seen = await a.http().get(`${base}/payments`).set('Authorization', cashier.auth).expect(200);
    expect(seen.body.data.map((p: any) => p.reference)).toEqual(['cmd-1']);
    expect(seen.body.data[0]).toMatchObject({ object: 'payment', status: 'en_attente', amount: 5000, currency: 'XAF', till_id: till1.id });
    expect(seen.body.data[0]).not.toHaveProperty('payerPhoneEnc');

    // Demander explicitement l'autre caisse est refusé, pas filtré en silence.
    await a.http().get(`${base}/payments?till_id=${till2.id}`).set('Authorization', cashier.auth).expect(403);

    // Le propriétaire voit tout.
    const all = await a.http().get(`${base}/payments`).set('Authorization', owner.auth).expect(200);
    expect(all.body.data.map((p: any) => p.reference).sort()).toEqual(['cmd-1', 'cmd-2']);

    // Détaché : l'accès est retiré aussitôt.
    await a.http().delete(`${base}/tills/${till1.id}/members/${cashier.memberId}`).set('Authorization', owner.auth).expect(200);
    await a.http().get(`${base}/payments`).set('Authorization', cashier.auth).expect(403);
  });

  it('pagination par curseur stable', async () => {
    const owner = await a.signUp();
    const { base, storeId, till1 } = await storeWithTills(owner);
    for (let i = 1; i <= 5; i++) await payment(owner.merchantId, storeId, till1.id, `cmd-${i}`);

    const p1 = await a.http().get(`${base}/payments?limit=2`).set('Authorization', owner.auth).expect(200);
    expect(p1.body).toMatchObject({ object: 'list', has_more: true });
    const p2 = await a.http().get(`${base}/payments?limit=2&starting_after=${p1.body.next_cursor}`).set('Authorization', owner.auth).expect(200);
    const p3 = await a.http().get(`${base}/payments?limit=2&starting_after=${p2.body.next_cursor}`).set('Authorization', owner.auth).expect(200);
    expect(p3.body.has_more).toBe(false);
    const refs = [...p1.body.data, ...p2.body.data, ...p3.body.data].map((p: any) => p.reference);
    expect(new Set(refs).size).toBe(5);

    const bad = await a.http().get(`${base}/payments?starting_after=xx`).set('Authorization', owner.auth).expect(400);
    expect(bad.body.error.code).toBe('curseur_invalide');
  });

  it('on ne rattache pas à une caisse un membre d’un autre marchand', async () => {
    const owner = await a.signUp();
    const other = await a.signUp('autre');
    const otherMember = await prisma.merchantMember.findFirstOrThrow({ where: { merchantId: other.merchantId } });
    const { base, till1 } = await storeWithTills(owner);
    await a.http().post(`${base}/tills/${till1.id}/members`).set('Authorization', owner.auth).send({ memberId: otherMember.id }).expect(404);
    // Ni toucher à la caisse d'un autre marchand.
    await a.http().patch(`/v1/merchants/${other.merchantId}/tills/${till1.id}`).set('Authorization', other.auth).send({ name: 'pirate' }).expect(404);
  });

  it('QR imprimable de la caisse en PDF A6 et A5 ; réservé aux gestionnaires ; audité (T-54)', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const { base, till1 } = await storeWithTills(owner);
    const pdf = (res: any, cb: any) => {
      res.setEncoding('binary');
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => cb(null, Buffer.from(data, 'binary')));
    };

    const a6 = await a.http().get(`${base}/tills/${till1.id}/qr.pdf`).set('Authorization', owner.auth).buffer(true).parse(pdf).expect(200);
    expect(a6.headers['content-type']).toBe('application/pdf');
    expect(a6.headers['content-disposition']).toContain(`qr-${till1.publicCode}-a6.pdf`);
    expect((a6.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((a6.body as Buffer).toString('latin1')).toMatch(/MediaBox \[0 0 297\.6\d* 419\.5\d*\]/);

    const a5 = await a.http().get(`${base}/tills/${till1.id}/qr.pdf?format=a5`).set('Authorization', owner.auth).buffer(true).parse(pdf).expect(200);
    expect((a5.body as Buffer).toString('latin1')).toMatch(/MediaBox \[0 0 419\.5\d* 595\.2\d*\]/);

    await a.http().get(`${base}/tills/${till1.id}/qr.pdf?format=a4`).set('Authorization', owner.auth).expect(400);
    await a.http().get(`${base}/tills/${till1.id}/qr.pdf`).set('Authorization', cashier.auth).expect(403);
    expect(await prisma.auditLog.count({ where: { action: 'stores.qr_generated', targetId: till1.id } })).toBe(2);
  });
});
