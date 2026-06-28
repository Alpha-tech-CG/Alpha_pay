import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurrencyService } from './currency.service';

function fakePrisma(rates: Array<{ base: string; quote: string; rate: number }> = []) {
  const find = (base: string, quote: string) =>
    rates.find((r) => r.base === base && r.quote === quote) ?? null;
  return {
    currencyRate: {
      findUnique: jest.fn(async ({ where }: any) => find(where.base_quote.base, where.base_quote.quote)),
      findMany: jest.fn(async () => rates),
      upsert: jest.fn(async ({ create }: any) => create),
    },
  } as any;
}

describe('CurrencyService (ALP-151)', () => {
  it('liste les devises supportées avec leurs décimales', () => {
    const svc = new CurrencyService(fakePrisma());
    const codes = svc.listCurrencies().map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['XAF', 'EUR', 'USD']));
    expect(svc.listCurrencies().find((c) => c.code === 'XAF')!.decimals).toBe(0);
  });

  it('convertit avec un taux direct et arrondit à la précision de la cible', async () => {
    const svc = new CurrencyService(fakePrisma([{ base: 'XAF', quote: 'EUR', rate: 0.001524 }]));
    const q = await svc.convert(100000, 'XAF', 'EUR'); // 100000 * 0.001524 = 152.4
    expect(q.convertedAmount).toBe(152.4);
    expect(q.rate).toBeCloseTo(0.001524);
    expect(q.formatted).toContain('€');
  });

  it('utilise le taux inverse quand seul le sens opposé est configuré', async () => {
    const svc = new CurrencyService(fakePrisma([{ base: 'EUR', quote: 'XAF', rate: 655.957 }]));
    const rate = await svc.getRate('XAF', 'EUR');
    expect(rate).toBeCloseTo(1 / 655.957);
  });

  it('taux 1 pour devise identique', async () => {
    const svc = new CurrencyService(fakePrisma());
    expect(await svc.getRate('EUR', 'EUR')).toBe(1);
  });

  it('refuse un montant fractionnaire en XAF (0 décimale)', async () => {
    const svc = new CurrencyService(fakePrisma([{ base: 'XAF', quote: 'EUR', rate: 0.0015 }]));
    await expect(svc.convert(10.5, 'XAF', 'EUR')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('autorise 2 décimales en EUR', async () => {
    const svc = new CurrencyService(fakePrisma([{ base: 'EUR', quote: 'USD', rate: 1.08 }]));
    const q = await svc.convert(10.5, 'EUR', 'USD');
    expect(q.convertedAmount).toBe(11.34);
  });

  it('404 si aucun taux configuré', async () => {
    const svc = new CurrencyService(fakePrisma());
    await expect(svc.getRate('XAF', 'USD')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse upsert base == quote', async () => {
    const svc = new CurrencyService(fakePrisma());
    await expect(svc.upsertRate('EUR', 'EUR', 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
