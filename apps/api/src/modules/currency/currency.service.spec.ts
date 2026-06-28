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

function fakeLedger() {
  return { postConversion: jest.fn(async () => 'fx-tx-1') } as any;
}

function make(rates: Array<{ base: string; quote: string; rate: number }> = []) {
  const ledger = fakeLedger();
  const svc = new CurrencyService(fakePrisma(rates), ledger);
  return { svc, ledger };
}

describe('CurrencyService (ALP-151)', () => {
  it('liste les devises supportées avec leurs décimales', () => {
    const { svc } = make();
    const codes = svc.listCurrencies().map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['XAF', 'EUR', 'USD']));
    expect(svc.listCurrencies().find((c) => c.code === 'XAF')!.decimals).toBe(0);
  });

  it('convertit avec un taux direct et arrondit à la précision de la cible', async () => {
    const { svc } = make([{ base: 'XAF', quote: 'EUR', rate: 0.001524 }]);
    const q = await svc.convert(100000, 'XAF', 'EUR');
    expect(q.convertedAmount).toBe(152.4);
    expect(q.formatted).toContain('€');
  });

  it('utilise le taux inverse quand seul le sens opposé est configuré', async () => {
    const { svc } = make([{ base: 'EUR', quote: 'XAF', rate: 655.957 }]);
    expect(await svc.getRate('XAF', 'EUR')).toBeCloseTo(1 / 655.957);
  });

  it('taux 1 pour devise identique', async () => {
    expect(await make().svc.getRate('EUR', 'EUR')).toBe(1);
  });

  it('refuse un montant fractionnaire en XAF (0 décimale)', async () => {
    const { svc } = make([{ base: 'XAF', quote: 'EUR', rate: 0.0015 }]);
    await expect(svc.convert(10.5, 'XAF', 'EUR')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('autorise 2 décimales en EUR', async () => {
    const { svc } = make([{ base: 'EUR', quote: 'USD', rate: 1.08 }]);
    expect((await svc.convert(10.5, 'EUR', 'USD')).convertedAmount).toBe(11.34);
  });

  it('404 si aucun taux configuré', async () => {
    await expect(make().svc.getRate('XAF', 'USD')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse upsert base == quote', async () => {
    await expect(make().svc.upsertRate('EUR', 'EUR', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('convertAndRecord pose une conversion équilibrée au grand livre', async () => {
    const { svc, ledger } = make([{ base: 'EUR', quote: 'XAF', rate: 655.957 }]);
    const res = await svc.convertAndRecord('m1', 10, 'EUR', 'XAF'); // 10 € -> 6560 FCFA (arrondi)
    expect(res.ledgerTransactionId).toBe('fx-tx-1');
    expect(ledger.postConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAccount: 'merchant-wallet-m1-EUR',
        toAccount: 'merchant-wallet-m1-XAF',
        currencyFrom: 'EUR',
        currencyTo: 'XAF',
      }),
    );
  });
});
