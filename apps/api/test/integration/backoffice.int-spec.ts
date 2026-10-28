import { prisma } from '@paybrain/database';
import { base32Decode, hotp, totpStep } from '../../src/common/security/totp';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';
import { staffSession } from './staff';

describe('M12 Back-office : personnel, rôles, OTP obligatoire (HTTP, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
  });
  afterAll(async () => {
    await t.app.close();
    await prisma.$disconnect();
  });

  it('connexion : mot de passe seul ne suffit jamais ; enrôlement puis OTP à chaque connexion', async () => {
    const agent = await staffSession(t, 'SUPPORT');
    await a.http().get('/internal/staff/me').set(agent.headers).expect(200);

    const step1 = await a.http().post('/internal/staff/login').send({ email: agent.email, password: agent.password }).expect(200);
    expect(step1.body).toEqual({ step: 'otp', otp_token: expect.any(String) });
    await a.http().get('/internal/staff/me').set({ Authorization: `Bearer ${step1.body.otp_token}` }).expect(401);

    // Le code du pas courant a déjà servi à l'enrôlement : on prend le pas suivant (tolérance d'un pas).
    const code = hotp(base32Decode(agent.secret), totpStep() + 1);
    const session = await a.http().post('/internal/staff/login/otp').send({ token: step1.body.otp_token, code }).expect(200);
    expect(session.body).toMatchObject({ token: expect.any(String), staff: { email: agent.email, role: 'SUPPORT' } });
    await a.http().post('/internal/staff/login/otp').send({ token: step1.body.otp_token, code }).expect(401); // jeton d'étape à usage unique
    expect(await prisma.auditLog.count({ where: { action: 'staff.login', actorType: 'staff' } })).toBeGreaterThanOrEqual(1);
  });

  it('un compte Support ne peut modifier aucune donnée (acceptation M12)', async () => {
    const owner = await a.signUp();
    const support = await staffSession(t, 'SUPPORT');
    const h = support.headers;

    // Lecture : autorisée.
    await a.http().get('/internal/merchants').set(h).expect(200);
    await a.http().get(`/internal/merchants/${owner.merchantId}`).set(h).expect(200);
    await a.http().get('/internal/supervision/dashboard').set(h).expect(200);
    await a.http().get('/internal/billing/plans').set(h).expect(200);

    // Écritures : toutes refusées.
    const writes = [
      a.http().post(`/internal/merchants/${owner.merchantId}/suspend`).set(h).send({ reason: 'Test' }),
      a.http().post(`/internal/merchants/${owner.merchantId}/reactivate`).set(h).send({ reason: 'Test' }),
      a.http().patch(`/internal/merchants/${owner.merchantId}/subscription`).set(h).send({ plan_code: 'pro', reason: 'Test' }),
      a.http().post(`/internal/merchants/${owner.merchantId}/credits/adjust`).set(h).send({ delta: 1000, reason: 'Test' }),
      a.http().patch('/internal/billing/plans/pro').set(h).send({ price_monthly: 1 }),
      a.http().post('/internal/staff/users').set(h).send({ email: 'x@alphapay.cg', display_name: 'X', role: 'SUPER_ADMIN', password: 'motdepasse-tres-long' }),
    ];
    for (const res of await Promise.all(writes)) expect(res.status).toBe(403);
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: owner.merchantId } });
    expect(merchant.isActive).toBe(true);
    expect(await prisma.creditLedger.count({ where: { merchantId: owner.merchantId, livemode: true } })).toBe(0);
  });

  it('conformité : suspension et réactivation avec motif obligatoire, auditées ; un marchand suspendu perd l’accès API', async () => {
    const owner = await a.signUp();
    const compliance = await staffSession(t, 'COMPLIANCE');
    await a.http().post(`/internal/merchants/${owner.merchantId}/suspend`).set(compliance.headers).send({}).expect(400);
    await a.http().post(`/internal/merchants/${owner.merchantId}/suspend`).set(compliance.headers).send({ reason: 'Fraude suspectée' }).expect(200);
    const sheet = await a.http().get(`/internal/merchants/${owner.merchantId}`).set(compliance.headers).expect(200);
    expect(sheet.body).toMatchObject({ active: false, suspension_reason: 'Fraude suspectée' });
    // Les paliers et prix restent au super-administrateur.
    await a.http().patch('/internal/billing/plans/pro').set(compliance.headers).send({ price_monthly: 1 }).expect(403);
    await a.http().post(`/internal/merchants/${owner.merchantId}/reactivate`).set(compliance.headers).send({ reason: 'Levée de doute' }).expect(200);
    const logs = await prisma.auditLog.findMany({ where: { merchantId: owner.merchantId, action: { in: ['merchant.suspended', 'merchant.reactivated'] } }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => `${l.action}:${l.actorType}:${l.actorId}:${(l.metadata as any).reason}`)).toEqual([
      `merchant.suspended:staff:${compliance.id}:Fraude suspectée`,
      `merchant.reactivated:staff:${compliance.id}:Levée de doute`,
    ]);
  });

  it('super-administrateur : prix d’un palier modifié sans déploiement (acceptation M11), crédits ajustés au registre', async () => {
    const owner = await a.signUp();
    const admin = await staffSession(t, 'SUPER_ADMIN');
    await prisma.billingPlan.create({ data: { code: 'commerce', label: 'Commerce', priceMonthly: 10000n, includedModules: ['m6_manage'] } });

    const updated = await a.http().patch('/internal/billing/plans/commerce').set(admin.headers).send({ price_monthly: 12500 }).expect(200);
    expect(updated.body).toMatchObject({ code: 'commerce', price_monthly: 12500 });
    const plans = await a.http().get(`/v1/merchants/${owner.merchantId}/billing/plans`).set('Authorization', owner.auth).expect(200);
    expect(JSON.stringify(plans.body)).toContain('12500');

    const adj = await a.http().post(`/internal/merchants/${owner.merchantId}/credits/adjust`).set(admin.headers).send({ delta: 500, reason: 'Geste commercial' }).expect(200);
    expect(adj.body.new_balance).toBe(500);
    await a.http().post(`/internal/merchants/${owner.merchantId}/credits/adjust`).set(admin.headers).send({ delta: 0, reason: 'x' }).expect(400);
    expect(await prisma.auditLog.count({ where: { action: { in: ['billing.plan_updated', 'merchant.credits_adjusted'] } } })).toBe(2);
  });

  it('création d’un agent par le super-administrateur ; mot de passe trop court refusé', async () => {
    const admin = await staffSession(t, 'SUPER_ADMIN');
    await a.http().post('/internal/staff/users').set(admin.headers).send({ email: 'nouveau@alphapay.cg', display_name: 'Nouveau', role: 'SUPPORT', password: 'court' }).expect(400);
    await a.http().post('/internal/staff/users').set(admin.headers).send({ email: 'nouveau@alphapay.cg', display_name: 'Nouveau', role: 'SUPPORT', password: 'motdepasse-tres-long' }).expect(201);
    const list = await a.http().get('/internal/staff/users').set(admin.headers).expect(200);
    expect(list.body.find((u: any) => u.email === 'nouveau@alphapay.cg')).toMatchObject({ role: 'SUPPORT', totpEnabled: false });
  });
});
