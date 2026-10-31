import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { RecoveryService } from '../../src/modules/invoicing/recovery.service';
import { RemindersService } from '../../src/modules/invoicing/reminders.service';
import { WebhookDeliveryService } from '../../src/modules/webhooks-out/webhook-delivery.service';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { db, resetDatabase } from './db';

/**
 * M7 Recouvrer (§M7, critères d'acceptation) sur Postgres réel :
 * - aucune relance pour une facture déjà payée, y compris si le paiement
 *   arrive entre la planification et l'envoi ;
 * - reçus numérotés sans doublon ni trou, y compris sous charge concurrente ;
 * - contrôle d'accès par rôle côté serveur, séparation test/live.
 */
jest.setTimeout(120_000);

describe('M7 Recouvrer (HTTP, Postgres réel)', () => {
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

  /** Le client paie sur la page hébergée, puis l'opérateur confirme (callback ou relance). */
  async function pay(paymentUrl: string) {
    const code = new URL(paymentUrl).pathname.split('/').pop();
    const started = await a.http().post(`/v1/public/links/${code}/pay`).send({ phone: MOCK_MOBILE_MONEY_NUMBERS.success }).expect(201);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: started.body.id } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
    return tx;
  }

  async function setup() {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}`;
    const customer = await a
      .http()
      .post(`${base}/customers`)
      .set('Authorization', owner.auth)
      .send({ name: 'Jean Mabiala', phone: '061234567', channels: ['whatsapp', 'sms'] })
      .expect(201);
    return { owner, base, customerId: customer.body.id as string };
  }

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  it('facture envoyée puis payée : numéro, lien, reçu, relances arrêtées, rejeu sans doublon', async () => {
    const { owner, base, customerId } = await setup();
    const dispatch = jest.spyOn(t.app.get(WebhookDeliveryService), 'dispatch');
    const created = await a
      .http()
      .post(`${base}/invoices`)
      .set('Authorization', owner.auth)
      .send({ customer_id: customerId, due_date: inDays(10), lines: [{ description: 'Sac de ciment', quantity: 2, unit_price: 7500 }], send: true })
      .expect(201);
    expect(created.body).toMatchObject({ number: 'FAC-T-000001', status: 'envoyée', total: 15000, amount_due: 15000, payment_url: expect.stringContaining('/l/') });
    expect(await db.invoiceReminder.count({ where: { invoiceId: created.body.id, status: 'PENDING' } })).toBe(4);
    await t.queue.drain('messages');
    expect(t.providers.outbox.sent.some((m) => m.to === '+242061234567')).toBe(true); // facture transmise

    const tx = await pay(created.body.payment_url);
    expect(tx.merchantId).toBe(owner.merchantId); // l'argent va au marchand, jamais à AlphaPay
    const paid = await a.http().get(`${base}/invoices/${created.body.id}`).set('Authorization', owner.auth).expect(200);
    expect(paid.body).toMatchObject({ status: 'payée', amount_due: 0, payment_url: null, receipts: [{ number: 'REC-T-000001', amount: 15000 }] });
    expect(await db.invoiceReminder.count({ where: { invoiceId: created.body.id, status: 'PENDING' } })).toBe(0);
    expect(dispatch).toHaveBeenCalledWith(owner.merchantId, false, 'invoice.paid', expect.objectContaining({ id: created.body.id, amount_due: 0 }));

    // Callback rejoué : ni second reçu ni double comptage.
    await t.app.get(RecoveryService).onPaymentSucceeded(await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } }));
    expect(await db.receipt.count({ where: { merchantId: owner.merchantId, livemode: false } })).toBe(1);
    const again = await a.http().get(`${base}/invoices/${created.body.id}`).set('Authorization', owner.auth).expect(200);
    expect(again.body.amount_paid).toBe(15000);

    // PDF de la facture et du reçu (public par lien signé).
    const pdf = await a.http().get(`${base}/invoices/${created.body.id}/pdf`).set('Authorization', owner.auth).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const receipts = await a.http().get(`${base}/receipts`).set('Authorization', owner.auth).expect(200);
    const publicPath = new URL(receipts.body.data[0].pdf_url).pathname;
    expect((await a.http().get(publicPath).expect(200)).body.subarray(0, 4).toString()).toBe('%PDF');
    await a.http().get(publicPath.replace(/[^/]+$/, 'signature-fausse')).expect(404);
    dispatch.mockRestore();
  });

  it('échéancier : chaque versement a son lien ; un versement payé → partiellement_payée, ses relances seules arrêtées', async () => {
    const { owner, base, customerId } = await setup();
    const inv = await a
      .http()
      .post(`${base}/invoices`)
      .set('Authorization', owner.auth)
      .send({
        customer_id: customerId,
        lines: [{ description: 'Scolarité', quantity: 1, unit_price: 90000 }],
        installments: [
          { due_date: inDays(5), amount: 45000, label: '1er trimestre' },
          { due_date: inDays(40), amount: 45000, label: '2e trimestre' },
        ],
        send: true,
      })
      .expect(201);
    const [first, second] = inv.body.installments;
    expect(first.payment_url).not.toBe(second.payment_url);
    await pay(first.payment_url);
    const after = await a.http().get(`${base}/invoices/${inv.body.id}`).set('Authorization', owner.auth).expect(200);
    expect(after.body).toMatchObject({ status: 'partiellement_payée', amount_paid: 45000, amount_due: 45000 });
    expect(after.body.installments.map((i: any) => i.status)).toEqual(['payé', 'en_attente']);
    expect(after.body.payment_url).toBe(second.payment_url);
    expect(await db.invoiceReminder.count({ where: { installmentId: first.id, status: 'PENDING' } })).toBe(0);
    expect(await db.invoiceReminder.count({ where: { installmentId: second.id, status: 'PENDING' } })).toBeGreaterThan(0);
  });

  it('aucune relance pour une facture payée, même payée entre la planification et l’envoi', async () => {
    const { owner, base, customerId } = await setup();
    const reminders = t.app.get(RemindersService);
    const make = () =>
      a
        .http()
        .post(`${base}/invoices`)
        .set('Authorization', owner.auth)
        .send({ customer_id: customerId, due_date: inDays(10), lines: [{ description: 'Livraison', quantity: 1, unit_price: 5000 }], send: true })
        .expect(201);
    const unpaid = await make();
    const paidLater = await make();
    // On avance la relance J-3 des deux factures : elle devient due maintenant.
    const sendAt = new Date();
    sendAt.setUTCHours(10, 0, 0, 0); // 11 h à Brazzaville : dans la plage
    await db.invoiceReminder.updateMany({ where: { daysOffset: -3 }, data: { scheduledFor: new Date(sendAt.getTime() - 60_000) } });

    // Paiement reçu après la planification, avant le passage de la tâche d'envoi.
    await pay(paidLater.body.payment_url);
    await t.queue.drain('messages');
    t.providers.outbox.clear();

    expect(await reminders.sendDue(sendAt)).toBe(1);
    await t.queue.drain('messages');
    const sentReminders = t.providers.outbox.sent.filter((m) => /Rappel|alphapay_relance/.test(m.content));
    expect(sentReminders).toHaveLength(1);
    const states = await db.invoiceReminder.findMany({ where: { daysOffset: -3 }, select: { invoiceId: true, status: true } });
    expect(states.find((r) => r.invoiceId === unpaid.body.id)!.status).toBe('SENT');
    expect(states.find((r) => r.invoiceId === paidLater.body.id)!.status).toBe('SKIPPED');

    // Hors plage (21 h à Brazzaville) : rien ne part, la relance est reportée au lendemain 8 h.
    const late = await make();
    const night = new Date(sendAt);
    night.setUTCHours(20, 0, 0, 0);
    await db.invoiceReminder.updateMany({ where: { invoiceId: late.body.id, daysOffset: -3 }, data: { scheduledFor: new Date(night.getTime() - 60_000) } });
    expect(await reminders.sendDue(night)).toBe(0);
    const postponed = await db.invoiceReminder.findFirstOrThrow({ where: { invoiceId: late.body.id, daysOffset: -3 } });
    expect(postponed.status).toBe('PENDING');
    expect(postponed.scheduledFor.getUTCHours()).toBe(7);
  });

  it('reçus numérotés sans trou ni doublon sous charge concurrente', async () => {
    const { owner } = await setup();
    const recovery = t.app.get(RecoveryService);
    const txs = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.transaction.create({ data: { merchantId: owner.merchantId, livemode: false, externalId: `conc-${i}`, amount: 1000n + BigInt(i), status: 'SUCCEEDED' } }),
      ),
    );
    // Chaque paiement livré deux fois, en parallèle : 12 reçus exactement.
    await Promise.all([...txs, ...txs].map((tx) => recovery.onPaymentSucceeded(tx)));
    const numbers = (await db.receipt.findMany({ where: { merchantId: owner.merchantId, livemode: false }, select: { number: true } })).map((r) => r.number).sort();
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => `REC-T-${String(i + 1).padStart(6, '0')}`));
    // Série live indépendante.
    const live = await db.transaction.create({ data: { merchantId: owner.merchantId, livemode: true, externalId: 'live-1', amount: 500n, status: 'SUCCEEDED' } });
    expect((await recovery.onPaymentSucceeded(live))!.number).toBe('REC-000001');
  });

  it('contrôle d’accès : caissier refusé, comptable en lecture seule ; test et live séparés', async () => {
    const { owner, base, customerId } = await setup();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const accountant = await a.inviteAndJoin(owner, 'ACCOUNTANT', 'comptable');
    const body = { customer_id: customerId, lines: [{ description: 'X', quantity: 1, unit_price: 1000 }] };

    await a.http().get(`${base}/invoices`).set('Authorization', cashier.auth).expect(403);
    await a.http().get(`${base}/customers`).set('Authorization', cashier.auth).expect(403);
    await a.http().post(`${base}/invoices`).set('Authorization', cashier.auth).send(body).expect(403);
    await a.http().get(`${base}/invoices`).set('Authorization', accountant.auth).expect(200);
    await a.http().post(`${base}/invoices`).set('Authorization', accountant.auth).send(body).expect(403);
    await a.http().patch(`${base}/recovery-settings`).set('Authorization', accountant.auth).send({ reminder_offsets: [0] }).expect(403);

    const draft = await a.http().post(`${base}/invoices`).set('Authorization', owner.auth).send(body).expect(201);
    expect((await a.http().get(`${base}/invoices?mode=live`).set('Authorization', owner.auth).expect(200)).body.data).toHaveLength(0);
    await a.http().get(`${base}/invoices/${draft.body.id}?mode=live`).set('Authorization', owner.auth).expect(404);
    // Un client de test ne sert pas en live.
    await a.http().post(`${base}/invoices?mode=live`).set('Authorization', owner.auth).send(body).expect(404);

    // Validation stricte et format d'erreur unique (§7).
    const bad = await a.http().post(`${base}/invoices`).set('Authorization', owner.auth).send({ lines: [{ description: 'X', quantity: -1, unit_price: 'abc' }] }).expect(400);
    expect(bad.body.error.code).toBe('validation_echouee');
  });

  it('calendrier de relances modifiable ; facture annulée sans relance ; passage en retard', async () => {
    const { owner, base, customerId } = await setup();
    await a.http().patch(`${base}/recovery-settings`).set('Authorization', owner.auth).send({ reminder_offsets: [-1, 2], send_from_hour: 9, send_until_hour: 18 }).expect(200);
    const inv = await a
      .http()
      .post(`${base}/invoices`)
      .set('Authorization', owner.auth)
      .send({ customer_id: customerId, due_date: inDays(10), lines: [{ description: 'Y', quantity: 1, unit_price: 2000 }], send: true })
      .expect(201);
    const planned = await db.invoiceReminder.findMany({ where: { invoiceId: inv.body.id }, orderBy: { daysOffset: 'asc' } });
    expect(planned.map((r) => r.daysOffset)).toEqual([-1, 2]);
    expect(planned.every((r) => r.scheduledFor.getUTCHours() === 8)).toBe(true); // 9 h à Brazzaville

    await a.http().post(`${base}/invoices/${inv.body.id}/void`).set('Authorization', owner.auth).expect(200);
    expect(await db.invoiceReminder.count({ where: { invoiceId: inv.body.id, status: 'PENDING' } })).toBe(0);

    const late = await a
      .http()
      .post(`${base}/invoices`)
      .set('Authorization', owner.auth)
      .send({ customer_id: customerId, due_date: inDays(1), lines: [{ description: 'Z', quantity: 1, unit_price: 2000 }], send: true })
      .expect(201);
    expect(await t.app.get(RemindersService).markOverdue(new Date(Date.now() + 3 * 86_400_000))).toBe(1);
    const overdue = await a.http().get(`${base}/invoices/${late.body.id}`).set('Authorization', owner.auth).expect(200);
    expect(overdue.body.status).toBe('en_retard');
    expect(overdue.body.payment_url).toEqual(expect.stringContaining('/l/')); // toujours payable
  });

  it('clients : recherche, pagination, modification, suppression refusée tant qu’une facture est ouverte, cloisonnement', async () => {
    const { owner, base, customerId } = await setup();
    const add = (body: object) => a.http().post(`${base}/customers`).set('Authorization', owner.auth).send(body).expect(201);
    const mail = await add({ name: 'Awa Ngoma', email: 'Awa@Exemple.CG' });
    expect(mail.body).toMatchObject({ email: 'awa@exemple.cg', channels: ['email'], phone: null });
    await add({ name: 'Paul Okemba', phone: '055443322' });

    const found = await a.http().get(`${base}/customers?q=ngoma`).set('Authorization', owner.auth).expect(200);
    expect(found.body.data.map((c: any) => c.name)).toEqual(['Awa Ngoma']);
    const byPhone = await a.http().get(`${base}/customers?q=055443`).set('Authorization', owner.auth).expect(200);
    expect(byPhone.body.data.map((c: any) => c.name)).toEqual(['Paul Okemba']);
    const p1 = await a.http().get(`${base}/customers?limit=2`).set('Authorization', owner.auth).expect(200);
    expect(p1.body).toMatchObject({ has_more: true, next_cursor: expect.any(String) });
    const p2 = await a.http().get(`${base}/customers?limit=2&starting_after=${p1.body.next_cursor}`).set('Authorization', owner.auth).expect(200);
    expect(p2.body.has_more).toBe(false);
    expect([...p1.body.data, ...p2.body.data].map((c: any) => c.id).sort()).toHaveLength(3);
    await a.http().get(`${base}/customers?starting_after=pas-un-curseur`).set('Authorization', owner.auth).expect(400);

    const patched = await a
      .http()
      .patch(`${base}/customers/${mail.body.id}`)
      .set('Authorization', owner.auth)
      .send({ name: '  Awa N. ', phone: '069998877', email: null, notes: 'Paie en fin de mois', channels: ['whatsapp'] })
      .expect(200);
    expect(patched.body).toMatchObject({ name: 'Awa N.', phone: '+242069998877', email: null, notes: 'Paie en fin de mois', channels: ['whatsapp'] });

    // Facture ouverte : le destinataire des relances ne peut pas disparaître.
    await a.http().post(`${base}/invoices`).set('Authorization', owner.auth)
      .send({ customer_id: customerId, lines: [{ description: 'Tôles', quantity: 1, unit_price: 5000 }], send: true }).expect(201);
    const conflict = await a.http().delete(`${base}/customers/${customerId}`).set('Authorization', owner.auth).expect(409);
    expect(conflict.body.error.code).toBe('client_factures_ouvertes');
    await a.http().delete(`${base}/customers/${mail.body.id}`).set('Authorization', owner.auth).expect(204);
    await a.http().get(`${base}/customers/${mail.body.id}`).set('Authorization', owner.auth).expect(404);

    // Un autre marchand ne voit ni ne modifie les clients du premier ; le mode live est séparé du test.
    const other = await a.signUp();
    await a.http().get(`/v1/merchants/${other.merchantId}/customers/${customerId}`).set('Authorization', other.auth).expect(404);
    await a.http().get(`${base}/customers/${customerId}`).set('Authorization', other.auth).expect(403);
    await a.http().get(`${base}/customers/${customerId}?mode=live`).set('Authorization', owner.auth).expect(404);
  });

  it('API publique : /v1/customers et /v1/invoices avec une clé ap_test_, idempotente', async () => {
    const { owner } = await setup();
    const key = await a.http().post(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', owner.auth).send({ name: 'ERP', mode: 'test' }).expect(201);
    const auth = `Bearer ${key.body.key}`;
    const customer = await a.http().post('/v1/customers').set('Authorization', auth).set('Idempotency-Key', randomUUID()).send({ name: 'Client API', email: 'client@exemple.cg' }).expect(201);
    const body = { customer_id: customer.body.id, lines: [{ description: 'Abonnement', quantity: 1, unit_price: 3000 }], send: true };
    const idem = randomUUID();
    const first = await a.http().post('/v1/invoices').set('Authorization', auth).set('Idempotency-Key', idem).send(body).expect(201);
    const replay = await a.http().post('/v1/invoices').set('Authorization', auth).set('Idempotency-Key', idem).send(body).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(first.body).toMatchObject({ livemode: false, status: 'envoyée', number: 'FAC-T-000001' });
    await a.http().get(`/v1/invoices/${first.body.id}`).set('Authorization', auth).expect(200);
  });
});
