import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts, identity } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

describe('D-065 Espace particulier : budget, épargne, AlphaPay (HTTP, Postgres réel)', () => {
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

  /** Inscription particulier : aucun commerce, identifiant AlphaPay créé. */
  async function person(name: string, phone?: string) {
    const id = { ...identity('perso'), name, ...(phone ? { phone } : {}) };
    const reg = await a.http().post('/v1/auth/register').send({ ...id, channel: 'sms', account_type: 'personal' }).expect(201);
    const res = await a.http().post('/v1/auth/verify').send({ challenge: reg.body.challenge, code: await t.lastCode(id.phone) }).expect(200);
    return { ...id, auth: `Bearer ${res.body.access_token}`, user: res.body.user };
  }

  it('inscription particulier, budget de départ, enveloppes, catégorisation, alertes 80 % et 100 %', async () => {
    const zlat = await person('Zlatan Mabiala');
    expect(zlat.user).toMatchObject({ merchants: [], personal: { alphapay_id: '@zlatan.mabiala.alphapay' } });
    expect(await prisma.merchant.count()).toBe(0);

    const sug = await a.http().get('/v1/personal/setup/suggestion?income=200000').set('Authorization', zlat.auth).expect(200);
    expect(sug.body.envelopes.find((e: any) => e.key === 'food').planned).toBe(50000);
    const food = 70000;
    const setup = await a.http().put('/v1/personal/setup').set('Authorization', zlat.auth)
      .send({ monthly_income: 200000, envelopes: [{ key: 'food', planned: food }, { key: 'transport', planned: 20000 }, { key: 'transfers', planned: 30000 }], goal_name: 'Fonds d’urgence', goal_target: 300000 }).expect(200);
    expect(setup.body).toMatchObject({ profile: { onboarded: true, monthly_income: 200000 }, envelopes: [{ key: 'food', planned: food }, { key: 'transport' }, { key: 'transfers' }], goals: [{ name: 'Fonds d’urgence', target: 300000 }] });

    const momo = await a.http().post('/v1/personal/accounts').set('Authorization', zlat.auth).send({ kind: 'mtn_momo', label: 'MTN MoMo', balance: 95000 }).expect(201);
    await a.http().post('/v1/personal/accounts').set('Authorization', zlat.auth).send({ kind: 'bank', label: 'BGFI', balance: 30000 }).expect(201);

    // Catégorisation automatique : « Supermarché » → Nourriture, débité du MoMo.
    const e1 = await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'out', amount: 42500, label: 'Supermarché Casino', account_id: momo.body.id }).expect(201);
    expect(e1.body).toMatchObject({ category: 'food', category_name: 'Nourriture', amount: 42500 });
    expect(await a.http().get('/v1/personal/alerts').set('Authorization', zlat.auth).expect(200).then((r) => r.body.data)).toHaveLength(0);

    await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'out', amount: 15000, label: 'Marché Total', account_id: momo.body.id }).expect(201);
    let alerts = (await a.http().get('/v1/personal/alerts').set('Authorization', zlat.auth).expect(200)).body.data;
    expect(alerts).toEqual([expect.objectContaining({ kind: 'budget', title: 'Budget Nourriture', body: expect.stringContaining('82 %') })]);

    await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'out', amount: 15000, label: 'Restaurant Mami Wata' }).expect(201);
    alerts = (await a.http().get('/v1/personal/alerts').set('Authorization', zlat.auth).expect(200)).body.data;
    expect(alerts.map((x: any) => x.title)).toEqual(['Budget Nourriture épuisé', 'Budget Nourriture']);

    const ov = (await a.http().get('/v1/personal').set('Authorization', zlat.auth).expect(200)).body;
    expect(ov).toMatchObject({ total_balance: 95000 - 42500 - 15000 + 30000, spent_this_month: 72500, unread_alerts: 2, remaining_to_spend: 70000 + 20000 + 30000 - 72500 });
    expect(ov.envelopes.find((e: any) => e.key === 'food')).toMatchObject({ spent: 72500, remaining: -2500, progress: 104 });

    // Correction : « Station Total » n'est pas de la nourriture ; l'application apprend.
    const wrong = await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'out', amount: 5000, label: 'Kiosque Ndeko' }).expect(201);
    expect(wrong.body.category).toBe('other');
    const transport = ov.envelopes.find((e: any) => e.key === 'transport');
    await a.http().patch(`/v1/personal/entries/${wrong.body.id}`).set('Authorization', zlat.auth).send({ category: 'transport', envelope_id: transport.id }).expect(200);
    const learned = await a.http().get('/v1/personal/categorize?label=KIOSQUE ndéko').set('Authorization', zlat.auth).expect(200);
    expect(learned.body).toMatchObject({ category: 'transport', envelope_id: transport.id, learned: true });

    // Suppression : le solde du compte est rétabli.
    await a.http().delete(`/v1/personal/entries/${e1.body.id}`).set('Authorization', zlat.auth).expect(200);
    expect((await prisma.personalAccount.findUniqueOrThrow({ where: { id: momo.body.id } })).balance).toBe(95000n - 15000n);

    // Une autre personne ne voit ni ne touche rien.
    const other = await person('Marie Okemba');
    await a.http().delete(`/v1/personal/entries/${wrong.body.id}`).set('Authorization', other.auth).expect(404);
    await a.http().get('/v1/personal').set('Authorization', (await a.signUp()).auth).expect(403);
  });

  it('épargne : arrondi automatique vers un objectif, paliers 25 %, retrait plafonné, rapport mensuel', async () => {
    const zlat = await person('Zlat Bouanga');
    const goal = (await a.http().post('/v1/personal/goals').set('Authorization', zlat.auth).send({ name: 'Téléphone', emoji: '📱', target: 1000, target_date: '2027-03-31' }).expect(201)).body;
    await a.http().patch('/v1/personal/settings').set('Authorization', zlat.auth).send({ round_up_enabled: true, round_up_to: 1000, round_up_goal_id: goal.id }).expect(200);

    const pay = await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'out', amount: 4750, label: 'Pharmacie du Plateau' }).expect(201);
    expect(pay.body).toMatchObject({ category: 'health', round_up: 250 });
    let g = (await a.http().get('/v1/personal/goals').set('Authorization', zlat.auth).expect(200)).body[0];
    expect(g).toMatchObject({ saved: 250, progress: 25 });

    await a.http().post(`/v1/personal/goals/${goal.id}/contributions`).set('Authorization', zlat.auth).send({ amount: 750, note: 'Fin du mois' }).expect(201);
    g = (await a.http().get('/v1/personal/goals').set('Authorization', zlat.auth).expect(200)).body[0];
    expect(g).toMatchObject({ saved: 1000, progress: 100 });
    const titles = (await a.http().get('/v1/personal/alerts').set('Authorization', zlat.auth).expect(200)).body.data.map((x: any) => x.title);
    expect(titles).toEqual(['Objectif atteint : Téléphone', 'Téléphone : 25 %']);

    const over = await a.http().post(`/v1/personal/goals/${goal.id}/contributions`).set('Authorization', zlat.auth).send({ amount: -5000 }).expect(422);
    expect(over.body.error.code).toBe('retrait_superieur');
    await a.http().post(`/v1/personal/goals/${goal.id}/contributions`).set('Authorization', zlat.auth).send({ amount: -400 }).expect(201);

    await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'in', amount: 250000, label: 'Salaire' }).expect(201);
    await a.http().post('/v1/personal/entries').set('Authorization', zlat.auth).send({ direction: 'out', amount: 35000, label: 'Taxi semaine' }).expect(201);
    const report = (await a.http().get('/v1/personal/report').set('Authorization', zlat.auth).expect(200)).body;
    expect(report).toMatchObject({ income: 250000, spent: 39750, saved: 600, top_categories: [{ category: 'transport', amount: 35000 }, { category: 'health', amount: 4750 }], advice: { category: 'transport', saving: 5500 } });
  });

  it('AlphaPay : envoi déclaré de MoMo à MoMo, idempotent, confirmé par le bénéficiaire ; contestation, annulation', async () => {
    const zlat = await person('Zlat Bouanga');
    const marie = await person('Marie Okemba');
    const marieId = marie.user.personal.alphapay_id as string;

    const found = await a.http().get(`/v1/personal/directory?to=${encodeURIComponent(marieId)}`).set('Authorization', zlat.auth).expect(200);
    expect(found.body).toEqual({ alphapay_id: marieId, name: 'Marie Okemba', phone_masked: expect.any(String) });
    expect((await a.http().get(`/v1/personal/directory?to=${encodeURIComponent(marie.phone)}`).set('Authorization', zlat.auth).expect(200)).body.alphapay_id).toBe(marieId);
    await a.http().get('/v1/personal/directory?to=@inconnu.alphapay').set('Authorization', zlat.auth).expect(404);
    await a.http().post('/v1/personal/transfers').set('Authorization', zlat.auth).send({ to: zlat.user.personal.alphapay_id, amount: 100 }).set('Idempotency-Key', 'self').expect(422);
    await a.http().post('/v1/personal/transfers').set('Authorization', zlat.auth).send({ to: marieId, amount: 100 }).expect(400);

    const send = () => a.http().post('/v1/personal/transfers').set('Authorization', zlat.auth).set('Idempotency-Key', 'send-1').send({ to: marieId, amount: 25000, note: 'Merci pour ton aide' });
    const first = await send().expect(201);
    expect(first.body).toMatchObject({ status: 'declared', amount: 25000, fee: 0, to: { alphapay_id: marieId, name: 'Marie Okemba' }, momo_number: marie.phone });
    expect((await send().expect(201)).body.id).toBe(first.body.id); // rejeu : même envoi
    expect(await prisma.personalTransfer.count()).toBe(1);
    expect(await prisma.budgetEntry.count({ where: { source: 'ALPHAPAY_TRANSFER' } })).toBe(1);

    await a.http().post(`/v1/personal/transfers/${first.body.id}/confirm`).set('Authorization', zlat.auth).expect(404); // seul le bénéficiaire confirme
    await a.http().post(`/v1/personal/transfers/${first.body.id}/confirm`).set('Authorization', marie.auth).expect(200);
    await a.http().post(`/v1/personal/transfers/${first.body.id}/confirm`).set('Authorization', marie.auth).expect(409);
    const marieEntries = (await a.http().get('/v1/personal/entries').set('Authorization', marie.auth).expect(200)).body.data;
    expect(marieEntries).toEqual([expect.objectContaining({ direction: 'in', amount: 25000, category: 'transfer_in', source: 'alphapay_transfer' })]);
    const zlatAlerts = (await a.http().get('/v1/personal/alerts').set('Authorization', zlat.auth).expect(200)).body.data;
    expect(zlatAlerts[0].title).toBe('Envoi confirmé');

    // Contestation puis annulation : la dépense disparaît du budget de l'expéditeur.
    const second = (await a.http().post('/v1/personal/transfers').set('Authorization', zlat.auth).set('Idempotency-Key', 'send-2').send({ to: marieId, amount: 5000 }).expect(201)).body;
    await a.http().post(`/v1/personal/transfers/${second.id}/dispute`).set('Authorization', marie.auth).expect(200);
    await a.http().post(`/v1/personal/transfers/${second.id}/cancel`).set('Authorization', zlat.auth).expect(200);
    expect(await prisma.budgetEntry.count({ where: { userId: zlat.user.id, source: 'ALPHAPAY_TRANSFER' } })).toBe(1);
    const history = (await a.http().get('/v1/personal/transfers').set('Authorization', zlat.auth).expect(200)).body.data;
    expect(history.map((h: any) => [h.direction, h.status])).toEqual([['sent', 'cancelled'], ['sent', 'confirmed']]);

    const report = (await a.http().get('/v1/personal/report').set('Authorization', marie.auth).expect(200)).body;
    expect(report).toMatchObject({ alphapay_received: 25000 });
  });

  it('demande de paiement : montant imposé, réglée une seule fois, rouverte si l’envoi est annulé', async () => {
    const zlat = await person('Zlat Bouanga');
    const marie = await person('Marie Okemba');
    const req = (await a.http().post('/v1/personal/requests').set('Authorization', zlat.auth).send({ amount: 50000, reason: 'Participation au cadeau' }).expect(201)).body;
    expect(req).toMatchObject({ status: 'open', from: zlat.user.personal.alphapay_id, qr_payload: expect.stringContaining(`request=${req.code}`) });
    expect((await a.http().get(`/v1/personal/requests/${req.code}`).set('Authorization', marie.auth).expect(200)).body.amount).toBe(50000);

    const pay = (amount: number, key: string) => a.http().post('/v1/personal/transfers').set('Authorization', marie.auth).set('Idempotency-Key', key).send({ to: zlat.user.personal.alphapay_id, amount, request_code: req.code });
    expect((await pay(40000, 'r1').expect(422)).body.error.code).toBe('montant_different');
    const paid = (await pay(50000, 'r2').expect(201)).body;
    expect((await a.http().get('/v1/personal/requests').set('Authorization', zlat.auth).expect(200)).body.data[0].status).toBe('paid');
    expect((await pay(50000, 'r3').expect(422)).body.error.code).toBe('demande_invalide');

    await a.http().post(`/v1/personal/transfers/${paid.id}/cancel`).set('Authorization', marie.auth).expect(200);
    expect((await a.http().get('/v1/personal/requests').set('Authorization', zlat.auth).expect(200)).body.data[0].status).toBe('open');
  });

  it('un paiement chez un marchand AlphaPay entre dans le budget du payeur, une seule fois', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}`;
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { name: 'Pharmacie Mavré' } });
    const store = await a.http().post(`${base}/stores`).set('Authorization', owner.auth).send({ name: 'Plateau' }).expect(201);
    const tl = (await a.http().post(`${base}/stores/${store.body.id}/tills`).set('Authorization', owner.auth).send({ name: 'Caisse 1' }).expect(201)).body;

    const zlat = await person('Zlat Bouanga', MOCK_MOBILE_MONEY_NUMBERS.success);
    const started = await a.http().post(`/v1/public/tills/${tl.publicCode}/pay`).send({ phone: zlat.phone, amount: 7500 }).expect(201);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: started.body.id } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');

    const entries = (await a.http().get('/v1/personal/entries').set('Authorization', zlat.auth).expect(200)).body.data;
    expect(entries).toEqual([expect.objectContaining({ direction: 'out', amount: 7500, category: 'health', label: 'Pharmacie Mavré (test)', source: 'alphapay_payment' })]);
  });
});
