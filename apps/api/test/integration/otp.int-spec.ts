import { prisma } from '@paybrain/database';
import { InMemoryJobQueue } from '../../src/common/queue/in-memory-job-queue';
import { MemoryKvStore } from '../../src/common/kv/kv-store';
import { logger } from '../../src/common/logging/logger';
import { CreditsService } from '../../src/modules/messaging/credits.service';
import { MessagingProviders } from '../../src/modules/messaging/messaging-providers';
import { MessagingService } from '../../src/modules/messaging/messaging.service';
import { OtpService } from '../../src/modules/messaging/otp.service';
import { TemplateService } from '../../src/modules/messaging/template.service';
import { createMerchant, db, resetDatabase } from './db';

const PHONE = '+242061234567';
const scope = { merchantId: null, livemode: false };

describe('M9 OTP (intégration, Postgres réel)', () => {
  let now: number;
  let kv: MemoryKvStore;
  let queue: InMemoryJobQueue;
  let providers: MessagingProviders;
  let otp: OtpService;
  let messaging: MessagingService;
  const logged: unknown[] = [];

  beforeEach(async () => {
    await resetDatabase();
    now = 1_900_000_000_000;
    kv = new MemoryKvStore(() => now);
    queue = new InMemoryJobQueue();
    providers = new MessagingProviders(kv);
    const templates = new TemplateService(db);
    await templates.syncCatalog();
    messaging = new MessagingService(db, templates, providers, new CreditsService(db), queue);
    messaging.register();
    otp = new OtpService(db, kv, messaging);
    logged.length = 0;
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(logger, level).mockImplementation(((...args: unknown[]) => void logged.push(args)) as any);
    }
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  /** Code tel que reçu par le destinataire (boîte d'envoi factice). */
  const lastCode = (channel: 'sms' | 'whatsapp' | 'email' = 'sms') => {
    const m = providers.outbox.last(channel)!;
    return channel === 'whatsapp' ? m.variables![0] : /\b(\d{6})\b/.exec(m.content)![1];
  };

  const send = (extra: Partial<Parameters<OtpService['send']>[0]> = {}) =>
    otp.send({ ...scope, destination: PHONE, channel: 'SMS', purpose: 'connexion', ...extra });
  const verify = (code: string, extra: Partial<Parameters<OtpService['verify']>[0]> = {}) =>
    otp.verify({ ...scope, destination: PHONE, channel: 'SMS', purpose: 'connexion', code, ...extra });

  it('WhatsApp en échec bascule sur SMS, et le code se vérifie (acceptation M9)', async () => {
    providers.outbox.failing.add(PHONE);
    const record = providers.outbox.record.bind(providers.outbox);
    providers.outbox.record = (m, p) => {
      if (m.channel === 'sms') providers.outbox.failing.delete(PHONE);
      return record(m, p);
    };

    const sent = await otp.send({ ...scope, destination: PHONE, channel: 'WHATSAPP', fallback: ['SMS'], purpose: 'connexion' });
    expect(sent).toMatchObject({ channel: 'WHATSAPP', expiresIn: 300 });
    await queue.drain('messages');

    const attempts = await prisma.message.findMany({ where: { groupId: sent.id }, orderBy: { createdAt: 'asc' } });
    expect(attempts.map((a) => [a.channel, a.status])).toEqual([
      ['WHATSAPP', 'FAILED'],
      ['SMS', 'SENT'],
    ]);
    await expect(verify(lastCode('sms'), { channel: 'WHATSAPP' })).resolves.toEqual({ valid: true });
  });

  it('usage unique : un code vérifié ne sert pas deux fois', async () => {
    await send();
    await queue.drain('messages');
    const code = lastCode();
    await expect(verify(code)).resolves.toEqual({ valid: true });
    await expect(verify(code)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_invalide' }) });
  });

  it('5 codes faux bloquent 15 minutes, même le bon code (acceptation M1)', async () => {
    await send();
    await queue.drain('messages');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i++) {
      await expect(verify(wrong)).rejects.toMatchObject({ status: 400 });
    }
    await expect(verify(wrong)).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ code: 'otp_bloque' }) });
    await expect(verify(code)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_bloque' }) });
    await expect(send()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_bloque' }) });

    now += 15 * 60 * 1000 + 1000; // fin du blocage
    await send();
    await queue.drain('messages');
    await expect(verify(lastCode())).resolves.toEqual({ valid: true });
  });

  it('le code est lié à l’usage et au périmètre (AlphaPay / marchand, test / live)', async () => {
    await send({ purpose: 'connexion' });
    await queue.drain('messages');
    const code = lastCode();
    await expect(verify(code, { purpose: 'reinitialisation' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_invalide' }) });
    await expect(verify(code, { livemode: true })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_invalide' }) });
    await expect(verify(code)).resolves.toEqual({ valid: true });
  });

  it('expire après 5 minutes', async () => {
    await send();
    await queue.drain('messages');
    const code = lastCode();
    now += 5 * 60 * 1000 + 1;
    await expect(verify(code)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_invalide' }) });
  });

  it('60 s minimum entre deux envois, et plafond par destination sur une heure', async () => {
    await send();
    await expect(send()).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ code: 'otp_trop_frequent' }) });
    for (let i = 0; i < 4; i++) {
      now += 61_000;
      await send();
    }
    now += 61_000;
    await expect(send()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'otp_limite_atteinte' }) });
  });

  it('plafond par adresse IP (fraude par SMS)', async () => {
    process.env.OTP_MAX_PER_IP_PER_HOUR = '3';
    try {
      for (let i = 0; i < 3; i++) await send({ destination: `+24206000010${i}`, ip: '198.51.100.7' });
      await expect(send({ destination: '+242060000109', ip: '198.51.100.7' })).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'otp_limite_atteinte' }),
      });
    } finally {
      delete process.env.OTP_MAX_PER_IP_PER_HOUR;
    }
  });

  it('vérifications concurrentes du bon code : une seule réussit', async () => {
    await send();
    await queue.drain('messages');
    const code = lastCode();
    const results = await Promise.allSettled([verify(code), verify(code), verify(code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('le code n’apparaît ni dans les journaux, ni dans l’audit, ni en clair en base', async () => {
    await send();
    await queue.drain('messages');
    const code = lastCode();
    await verify(code === '000000' ? '111111' : '000000').catch(() => undefined);
    await verify(code);

    expect(JSON.stringify(logged)).not.toContain(code);
    const audit = await prisma.otpAudit.findMany();
    expect(audit.map((a) => a.event)).toEqual(expect.arrayContaining(['sent', 'invalid', 'verified']));
    expect(JSON.stringify(audit, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v))).not.toContain(code);
    // En base, le code n'existe que chiffré, puis est purgé passé 10 minutes.
    const raw = (m: { variablesEnc: Uint8Array | null }) => (m.variablesEnc ? Buffer.from(m.variablesEnc).toString('latin1') : '');
    for (const m of await prisma.message.findMany()) expect(raw(m)).not.toContain(code);
    expect(await messaging.purgeExpiredOtpContent(new Date(Date.now() + 11 * 60 * 1000))).toBeGreaterThan(0);
    for (const m of await prisma.message.findMany()) expect([m.variablesEnc, m.contactEnc]).toEqual([null, null]);
  });

  it('OTP marchand en live sans crédits : 402, rien n’est envoyé ni immobilisé', async () => {
    const merchant = await createMerchant('Pharmacie Test');
    const live = { merchantId: merchant.id, livemode: true, merchantName: merchant.name, chargeCredits: true };
    await expect(send(live)).rejects.toMatchObject({ status: 402, response: expect.objectContaining({ code: 'credits_insuffisants' }) });
    expect(providers.outbox.sent).toHaveLength(0);

    await prisma.creditLedger.create({ data: { merchantId: merchant.id, livemode: true, delta: 1, reason: 'achat' } });
    await send(live); // pas de délai de 60 s imposé par la tentative refusée
    await queue.drain('messages');
    expect(providers.outbox.last('sms')!.content).toContain('Pharmacie Test');
  });
});
