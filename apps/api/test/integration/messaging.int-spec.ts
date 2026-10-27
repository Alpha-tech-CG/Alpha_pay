import { prisma } from '@paybrain/database';
import { InMemoryJobQueue } from '../../src/common/queue/in-memory-job-queue';
import { MemoryKvStore } from '../../src/common/kv/kv-store';
import { CreditsService } from '../../src/modules/messaging/credits.service';
import { MessagingProviders } from '../../src/modules/messaging/messaging-providers';
import { MessagingService } from '../../src/modules/messaging/messaging.service';
import { TemplateService } from '../../src/modules/messaging/template.service';
import { createMerchant, db, resetDatabase } from './db';

const PHONE = '+242061234567';

describe('M9 Messages (intégration, Postgres réel)', () => {
  let queue: InMemoryJobQueue;
  let providers: MessagingProviders;
  let credits: CreditsService;
  let messaging: MessagingService;

  beforeEach(async () => {
    await resetDatabase();
    queue = new InMemoryJobQueue();
    providers = new MessagingProviders(new MemoryKvStore());
    const templates = new TemplateService(db);
    await templates.syncCatalog();
    credits = new CreditsService(db);
    messaging = new MessagingService(db, templates, providers, credits, queue);
    messaging.register();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const otp = (channels: ('WHATSAPP' | 'SMS' | 'EMAIL')[], extra: Partial<Parameters<MessagingService['send']>[0]> = {}) =>
    messaging.send({
      merchantId: null,
      livemode: false,
      channels,
      to: { phone: PHONE, email: 'gerant@example.cg' },
      templateKey: 'otp.code',
      variables: { code: '482913' },
      category: 'OTP',
      maxAttempts: 2,
      ...extra,
    });

  it('envoie via la file et journalise sans donnée en clair', async () => {
    const { id } = await otp(['SMS']);
    await queue.drain('messages');

    const sms = providers.outbox.last('sms')!;
    expect(sms.to).toBe(PHONE);
    expect(sms.content).toContain('482913');

    const row = await prisma.message.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'SENT', provider: 'mock-sms', templateVersion: 1, attempts: 1 });
    expect(row.destinationMasked).not.toContain('1234567');
    // Ni le numéro ni le code ne figurent en clair dans la ligne journalisée.
    const serialized = JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v));
    expect(serialized).not.toContain('482913');
    expect(serialized).not.toContain('061234567');
  });

  it('bascule WhatsApp → SMS quand WhatsApp échoue définitivement (acceptation M9)', async () => {
    providers.outbox.failing.add(PHONE);
    // Seul WhatsApp échoue : on retire le numéro de la liste avant le passage du SMS.
    const originalRecord = providers.outbox.record.bind(providers.outbox);
    providers.outbox.record = (message, provider) => {
      if (message.channel === 'sms') providers.outbox.failing.delete(PHONE);
      return originalRecord(message, provider);
    };

    const { id } = await otp(['WHATSAPP', 'SMS']);
    await queue.drain('messages');

    const attempts = await prisma.message.findMany({ where: { groupId: id }, orderBy: { createdAt: 'asc' } });
    expect(attempts.map((a) => [a.channel, a.status])).toEqual([
      ['WHATSAPP', 'FAILED'],
      ['SMS', 'SENT'],
    ]);
    expect(attempts[1].fallbackOfId).toBe(attempts[0].id);
    expect(providers.outbox.last('sms')!.content).toContain('482913');
    // La tentative échouée ne garde ni contact ni variables.
    expect(attempts[0].variablesEnc).toBeNull();
  });

  it('réessaie une panne fournisseur puis bascule après la dernière tentative', async () => {
    providers.outbox.unavailable = true;
    const { id } = await otp(['WHATSAPP', 'SMS']);
    await queue.drainOnce('messages'); // WhatsApp : 1re tentative en panne, réessai prévu
    expect(queue.jobs).toHaveLength(1);
    providers.outbox.unavailable = false;
    providers.outbox.failing.add(PHONE); // 2e tentative WhatsApp : échec définitif → bascule
    const recordSms = providers.outbox.record.bind(providers.outbox);
    providers.outbox.record = (m, p) => {
      if (m.channel === 'sms') providers.outbox.failing.delete(PHONE);
      return recordSms(m, p);
    };
    await queue.drain('messages');

    const attempts = await prisma.message.findMany({ where: { groupId: id }, orderBy: { createdAt: 'asc' } });
    expect(attempts[0]).toMatchObject({ channel: 'WHATSAPP', status: 'FAILED', attempts: 2 });
    expect(attempts[1]).toMatchObject({ channel: 'SMS', status: 'SENT' });
  });

  describe('crédits (§M9, §M11)', () => {
    const merchantSend = (merchantId: string, livemode = true) =>
      messaging.send({
        merchantId,
        livemode,
        channels: ['SMS'],
        to: { phone: PHONE },
        templateKey: 'message.libre',
        variables: { text: 'Votre commande est prête.' },
        category: 'TRANSACTIONAL',
        chargeCredits: true,
      });

    it('sans crédits : 402 credits_insuffisants et aucun message ne part (acceptation M9)', async () => {
      const merchant = await createMerchant();
      await expect(merchantSend(merchant.id)).rejects.toMatchObject({
        status: 402,
        response: expect.objectContaining({ code: 'credits_insuffisants' }),
      });
      expect(await prisma.message.count({ where: { merchantId: merchant.id } })).toBe(0);
      await queue.drain('messages').catch(() => 0);
      expect(providers.outbox.sent).toHaveLength(0);
    });

    it('débite à l’envoi, rembourse un message jamais accepté, ne facture pas le mode test', async () => {
      const merchant = await createMerchant();
      await prisma.creditLedger.create({ data: { merchantId: merchant.id, livemode: true, delta: 2, reason: 'achat' } });

      await merchantSend(merchant.id);
      expect(await credits.balance(merchant.id, true)).toBe(1);
      await queue.drain('messages');

      providers.outbox.failing.add(PHONE);
      await merchantSend(merchant.id);
      expect(await credits.balance(merchant.id, true)).toBe(0);
      await queue.drain('messages');
      expect(await credits.balance(merchant.id, true)).toBe(1); // remboursé

      await merchantSend(merchant.id, false); // mode test : gratuit
      expect(await credits.balance(merchant.id, true)).toBe(1);
      expect(await credits.balance(merchant.id, false)).toBe(0);
    });

    it('le registre est en ajout seul (trigger Postgres)', async () => {
      const merchant = await createMerchant();
      const row = await prisma.creditLedger.create({ data: { merchantId: merchant.id, livemode: true, delta: 5, reason: 'achat' } });
      await expect(prisma.creditLedger.update({ where: { id: row.id }, data: { delta: 500 } })).rejects.toThrow(/ajout seul/);
      await expect(prisma.creditLedger.delete({ where: { id: row.id } })).rejects.toThrow(/ajout seul/);
    });

    it('envois concurrents : le solde ne peut pas être dépensé deux fois', async () => {
      const merchant = await createMerchant();
      await prisma.creditLedger.create({ data: { merchantId: merchant.id, livemode: true, delta: 3, reason: 'achat' } });
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => merchantSend(merchant.id)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      expect(await credits.balance(merchant.id, true)).toBe(0);
    });
  });

  it('STOP : désabonne des messages marketing, jamais des transactionnels ni des OTP', async () => {
    expect(await messaging.applyInbound('SMS', [{ from: PHONE, text: ' stop ' }])).toBe(1);
    expect(await messaging.applyInbound('SMS', [{ from: PHONE, text: 'STOP' }])).toBe(0); // idempotent

    const marketing = await messaging.send({
      merchantId: null,
      livemode: false,
      channels: ['SMS'],
      to: { phone: PHONE },
      templateKey: 'message.libre',
      variables: { text: 'Promotion' },
      category: 'MARKETING',
    });
    expect(marketing.status).toBe('SKIPPED');

    await otp(['SMS']);
    await queue.drain('messages');
    expect(providers.outbox.sent.map((m) => m.channel)).toEqual(['sms']);
  });

  it('accusés de livraison : progression, idempotence, échec tardif → bascule', async () => {
    const { id } = await otp(['WHATSAPP', 'SMS']);
    await queue.drain('messages');
    const wa = await prisma.message.findUniqueOrThrow({ where: { id } });

    // Échec de livraison WhatsApp signalé après l'envoi : bascule sur SMS.
    await messaging.applyDeliveryEvents('mock-whatsapp', [{ providerMessageId: wa.providerMessageId!, status: 'failed', failureReason: '131026' }]);
    await queue.drain('messages');
    const sms = await prisma.message.findFirstOrThrow({ where: { groupId: id, channel: 'SMS', livemode: false } });
    expect(sms.status).toBe('SENT');

    await messaging.applyDeliveryEvents('mock-sms', [{ providerMessageId: sms.providerMessageId!, status: 'delivered', cost: { amount: 25, currency: 'XAF' } }]);
    await messaging.applyDeliveryEvents('mock-sms', [{ providerMessageId: sms.providerMessageId!, status: 'sent' }]); // tardif : ignoré
    const delivered = await prisma.message.findUniqueOrThrow({ where: { id: sms.id } });
    expect(delivered).toMatchObject({ status: 'DELIVERED', costMinor: 25n, costCurrency: 'XAF', contactEnc: null, variablesEnc: null });

    const status = await messaging.status(id, null as any, false).catch(() => null);
    expect(status).toBeNull(); // un message interne n'est pas lisible via l'API marchand
  });

  it('refuse un modèle inconnu et un canal sans modèle', async () => {
    await expect(
      messaging.send({ merchantId: null, livemode: false, channels: ['SMS'], to: { phone: PHONE }, templateKey: 'inexistant', variables: {}, category: 'TRANSACTIONAL' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'modele_inconnu' }) });
    await expect(
      messaging.send({ merchantId: null, livemode: false, channels: ['WHATSAPP'], to: { phone: PHONE }, templateKey: 'message.libre', variables: { text: 'x' }, category: 'TRANSACTIONAL' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'modele_inconnu' }) });
  });
});
