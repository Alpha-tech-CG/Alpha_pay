import { BillingService } from './billing.service';

describe('BillingService.checkModuleAccess (§M11)', () => {
  const plans: Record<string, any> = {
    gratuit: { code: 'gratuit', includedModules: [] },
    pro: { code: 'pro', includedModules: ['m6_manage', 'm7_recover'] },
  };
  let sub: any;
  let svc: BillingService;

  beforeEach(() => {
    sub = null;
    const prisma: any = {
      subscription: { findUnique: jest.fn(async () => sub) },
      billingPlan: { findUnique: jest.fn(async ({ where }: any) => plans[where.code] ?? null) },
    };
    svc = new BillingService(prisma, {} as any, { onSucceeded: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('sans abonnement : palier gratuit, modules payants verrouillés (visibles mais refusés)', async () => {
    expect(await svc.checkModuleAccess('m', 'm7_recover')).toEqual({ allowed: false, readonly: false, plan: 'gratuit' });
  });

  it('palier actif : modules inclus ouverts, les autres verrouillés', async () => {
    sub = { status: 'ACTIVE', plan: plans.pro };
    expect(await svc.checkModuleAccess('m', 'm7_recover')).toEqual({ allowed: true, readonly: false, plan: 'pro' });
    expect(await svc.checkModuleAccess('m', 'm8_school')).toMatchObject({ allowed: false });
  });

  it('période de grâce : accès complet ; au-delà (impayé) : lecture seule', async () => {
    sub = { status: 'GRACE', plan: plans.pro };
    expect(await svc.checkModuleAccess('m', 'm6_manage')).toMatchObject({ allowed: true, readonly: false });
    sub = { status: 'EXPIRED', plan: plans.pro };
    expect(await svc.checkModuleAccess('m', 'm6_manage')).toMatchObject({ allowed: true, readonly: true });
  });
});

describe('BillingService.subscribe (§M11)', () => {
  // Régression : les paliers payants sont livrés à 0 tant que les prix ne sont pas
  // fixés ; un prix à 0 activait le palier sans facture (Pro gratuit pour tous).
  it('refuse un palier payant dont le prix n’est pas encore fixé, sans rien activer', async () => {
    const prisma: any = {
      billingPlan: { findUnique: jest.fn(async () => ({ id: 'p-pro', code: 'pro', label: 'Pro', isActive: true, priceMonthly: 0n })) },
      subscription: { upsert: jest.fn() },
    };
    const svc = new BillingService(prisma, {} as any, { onSucceeded: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any);

    await expect(svc.subscribe('m', 'pro', 'u')).rejects.toMatchObject({ response: { code: 'prix_non_fixe' } });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });
});
