import { FeesService } from './fees.service';

const svc = new FeesService({} as any);
const rule = (over: Partial<any> = {}) => ({
  id: 'r', feeProfileId: 'p', method: null, partnerId: null,
  minAmountCents: null, maxAmountCents: null, percentBps: 0, fixedCents: 0n, currency: 'XAF', ...over,
});

describe('FeesService.compute', () => {
  it('applique % (bps) + part fixe', () => {
    const res = svc.compute([rule({ percentBps: 150, fixedCents: 5000n })], { amountCents: 100000n, currency: 'XAF' });
    // 150 bps de 100000 = 1500 ; + 5000 fixe = 6500
    expect(res.matched).toBe(true);
    expect(res.feeCents).toBe('6500');
  });

  it('choisit la règle la PLUS spécifique', () => {
    const generic = rule({ id: 'g', percentBps: 200 });
    const specific = rule({ id: 's', method: 'CARD', percentBps: 100 });
    const res = svc.compute([generic, specific], { amountCents: 100000n, currency: 'XAF', method: 'CARD' as any });
    expect(res.ruleId).toBe('s');
    expect(res.feeCents).toBe('1000');
  });

  it('filtre par devise', () => {
    const res = svc.compute([rule({ currency: 'USD' })], { amountCents: 100000n, currency: 'XAF' });
    expect(res.matched).toBe(false);
  });

  it('respecte les bornes de montant', () => {
    const r = [rule({ minAmountCents: 50000n, percentBps: 100 })];
    expect(svc.compute(r, { amountCents: 10000n, currency: 'XAF' }).matched).toBe(false);
    expect(svc.compute(r, { amountCents: 90000n, currency: 'XAF' }).matched).toBe(true);
  });
});
