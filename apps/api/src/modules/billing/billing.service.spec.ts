import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';

function makePrisma(overrides: Partial<Record<string, any>> = {}) {
  return {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      ...overrides.subscription,
    },
    billingPlan: {
      findUnique: jest.fn().mockResolvedValue(null),
      ...overrides.billingPlan,
    },
    creditLedger: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { delta: 0 } }),
      create: jest.fn().mockResolvedValue({}),
      ...overrides.creditLedger,
    },
    alphapayInvoice: {
      create: jest.fn().mockResolvedValue({}),
      ...overrides.alphapayInvoice,
    },
  } as any;
}

const TRIAL_PLAN = {
  id: 'plan-trial',
  code: 'TRIAL',
  name: 'Trial',
  includedModules: ['m6_manage', 'm7_recover'],
  includedCredits: 0,
  monthlyPriceCents: 0,
};

const ACTIVE_SUB = {
  id: 'sub-1',
  merchantId: 'merch-1',
  status: 'ACTIVE',
  periodEnd: new Date(Date.now() + 86_400_000),
  plan: {
    includedModules: ['m6_manage', 'm7_recover', 'm8_school'],
    includedCredits: 100,
  },
};

const GRACE_SUB = { ...ACTIVE_SUB, status: 'GRACE' };
const EXPIRED_SUB = { ...ACTIVE_SUB, status: 'EXPIRED', periodEnd: new Date(Date.now() - 1000) };

describe('BillingService.checkModuleAccess', () => {
  it('TRIAL avec module inclus → allowed', async () => {
    const prisma = makePrisma({
      subscription: { findUnique: jest.fn().mockResolvedValue({ ...ACTIVE_SUB, status: 'TRIAL' }) },
    });
    const svc = new BillingService(prisma);
    const r = await svc.checkModuleAccess('merch-1', 'm6_manage');
    expect(r).toEqual({ allowed: true, readonly: false });
  });

  it('GRACE → allowed readonly (encaissements jamais bloqués)', async () => {
    const prisma = makePrisma({
      subscription: { findUnique: jest.fn().mockResolvedValue(GRACE_SUB) },
    });
    const svc = new BillingService(prisma);
    const r = await svc.checkModuleAccess('merch-1', 'm6_manage');
    expect(r).toEqual({ allowed: true, readonly: true });
  });

  it('EXPIRED module non inclus → not allowed', async () => {
    const prisma = makePrisma({
      subscription: { findUnique: jest.fn().mockResolvedValue(EXPIRED_SUB) },
    });
    const svc = new BillingService(prisma);
    const r = await svc.checkModuleAccess('merch-1', 'm11_billing');
    expect(r.allowed).toBe(false);
  });

  it('aucun abonnement → allowed par défaut (TRIAL implicite)', async () => {
    const prisma = makePrisma();
    const svc = new BillingService(prisma);
    const r = await svc.checkModuleAccess('merch-1', 'm6_manage');
    expect(r.allowed).toBe(true);
  });
});

describe('BillingService.debitCredit', () => {
  it('débite quand le solde est suffisant', async () => {
    const prisma = makePrisma({
      creditLedger: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { delta: 50 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    });
    const svc = new BillingService(prisma);
    await expect(svc.debitCredit('merch-1', 10, 'test')).resolves.not.toThrow();
    expect(prisma.creditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: -10 }) }),
    );
  });

  it('lève credits_insuffisants quand le solde est insuffisant', async () => {
    const prisma = makePrisma({
      creditLedger: { aggregate: jest.fn().mockResolvedValue({ _sum: { delta: 5 } }), create: jest.fn() },
    });
    const svc = new BillingService(prisma);
    await expect(svc.debitCredit('merch-1', 10, 'test')).rejects.toThrow(BadRequestException);
  });

  it('refuse un montant de débit nul ou négatif', async () => {
    const prisma = makePrisma({
      creditLedger: { aggregate: jest.fn().mockResolvedValue({ _sum: { delta: 100 } }), create: jest.fn() },
    });
    const svc = new BillingService(prisma);
    await expect(svc.debitCredit('merch-1', 0, 'test')).rejects.toThrow();
    await expect(svc.debitCredit('merch-1', -5, 'test')).rejects.toThrow();
  });
});
