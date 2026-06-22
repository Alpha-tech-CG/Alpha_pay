import { UssdService } from './ussd.service';

function deps(link: any = undefined) {
  const state = { link: link ?? null, used: false };
  const prisma: any = {
    paymentLink: {
      findUnique: jest.fn(async () => state.link),
      updateMany: jest.fn(async ({ where, data }: any) => {
        // claim: usedAt:null requis
        if (where.usedAt === null) {
          if (state.used) return { count: 0 };
          state.used = true;
          return { count: 1 };
        }
        // libération
        if (data?.usedAt === null) state.used = false;
        return { count: 1 };
      }),
    },
  };
  const payments = { initiatePayment: jest.fn().mockResolvedValue({ status: 'PENDING', referenceId: 'r1' }) };
  const svc = new UssdService(prisma as any, payments as any);
  return { svc, prisma, payments, state };
}

const LINK = {
  code: '12345678', merchantId: 'm1', amount: 250000n, currency: 'XAF',
  description: 'T-shirt', usedAt: null, expiresAt: null, merchant: { name: 'Alpha-Educ' },
};

describe('UssdService (téléphone à touches)', () => {
  it('écran d’accueil : demande le code', async () => {
    const { svc } = deps();
    const r = await svc.handleSession({ phoneNumber: '+242066', text: '' });
    expect(r).toMatch(/^CON /);
    expect(r).toMatch(/code de paiement/i);
  });

  it('code valide → récapitulatif avec montant et marchand + choix', async () => {
    const { svc } = deps(LINK);
    const r = await svc.handleSession({ phoneNumber: '+242066', text: '12345678' });
    expect(r).toMatch(/^CON Payer/);
    expect(r).toMatch(/2.?500/); // séparateur de milliers locale-dépendant
    expect(r).toContain('Alpha-Educ');
    expect(r).toContain('1. Confirmer');
  });

  it('confirmation (code*1) → initie le paiement sur le numéro du payeur et clôt', async () => {
    const { svc, payments } = deps(LINK);
    const r = await svc.handleSession({ phoneNumber: '+242066123456', text: '12345678*1' });
    expect(r).toMatch(/^END .*initié/i);
    expect(payments.initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2500, currency: 'XAF', phone: '+242066123456', externalId: 'ussd-12345678' }),
      'm1',
    );
  });

  it('annulation (code*2) → END sans paiement', async () => {
    const { svc, payments } = deps(LINK);
    expect(await svc.handleSession({ phoneNumber: '+242066', text: '12345678*2' })).toBe('END Paiement annulé.');
    expect(payments.initiatePayment).not.toHaveBeenCalled();
  });

  it('code mal formé → END invalide', async () => {
    const { svc } = deps(LINK);
    expect(await svc.handleSession({ phoneNumber: '+242066', text: 'abc' })).toMatch(/invalide/i);
  });

  it('code inconnu → END introuvable', async () => {
    const { svc } = deps(null);
    expect(await svc.handleSession({ phoneNumber: '+242066', text: '99999999' })).toMatch(/introuvable/i);
  });

  it('anti double-paiement : un code déjà confirmé ne repaie pas', async () => {
    const { svc, payments } = deps(LINK);
    await svc.handleSession({ phoneNumber: '+242066', text: '12345678*1' });
    const second = await svc.handleSession({ phoneNumber: '+242066', text: '12345678*1' });
    expect(second).toMatch(/déjà été utilisé/i);
    expect(payments.initiatePayment).toHaveBeenCalledTimes(1);
  });
});
