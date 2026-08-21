import { RoutingService } from './routing.service';

const makeSvc = (rules: any[]) =>
  new RoutingService({ routingRule: { findMany: jest.fn().mockResolvedValue(rules) } } as any);

const rule = (over: Partial<any> = {}) => ({
  id: 'r', name: 'R', priority: 100, enabled: true,
  country: null, currency: null, method: null, minAmountCents: null, maxAmountCents: null,
  merchantSegment: null, binPrefix: null, partnerId: 'p1',
  partner: { code: 'MTN', status: 'ACTIVE' }, ...over,
});

describe('RoutingService.route', () => {
  it('renvoie la première règle applicable (ordre priorité fourni par la DB)', async () => {
    const svc = makeSvc([rule({ id: 'a', currency: 'XAF', partner: { code: 'AIRTEL', status: 'ACTIVE' } })]);
    const d = await svc.route({ currency: 'XAF' } as any);
    expect(d.matched).toBe(true);
    expect(d.partnerCode).toBe('AIRTEL');
    expect(d.ruleId).toBe('a');
  });

  it('ne route jamais vers un partenaire INACTIVE', async () => {
    const svc = makeSvc([rule({ partner: { code: 'X', status: 'INACTIVE' } })]);
    expect((await svc.route({} as any)).matched).toBe(false);
  });

  it('respecte les bornes de montant (min)', async () => {
    const svc = makeSvc([rule({ minAmountCents: 5000n, partner: { code: 'BIG', status: 'ACTIVE' } })]);
    expect((await svc.route({ amountCents: 1000 } as any)).matched).toBe(false);
    expect((await svc.route({ amountCents: 9000 } as any)).matched).toBe(true);
  });

  it('filtre par méthode + pays', async () => {
    const svc = makeSvc([rule({ method: 'CARD', country: 'CG', partner: { code: 'VISA', status: 'ACTIVE' } })]);
    expect((await svc.route({ method: 'MOBILE_MONEY', country: 'CG' } as any)).matched).toBe(false);
    expect((await svc.route({ method: 'CARD', country: 'CG' } as any)).partnerCode).toBe('VISA');
  });
});
