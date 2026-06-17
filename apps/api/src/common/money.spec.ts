import { toCents, toMajor } from './money';

describe('money (ALP-168)', () => {
  it('toCents convertit en centimes (BigInt exact)', () => {
    expect(toCents(100)).toBe(10000n);
    expect(toCents(1)).toBe(100n);
    expect(toCents(99.99)).toBe(9999n);
  });

  it('toMajor reconvertit en unités majeures', () => {
    expect(toMajor(10000n)).toBe(100);
    expect(toMajor(9999n)).toBe(99.99);
  });

  it('roundtrip stable sur des entiers', () => {
    for (const v of [1, 50, 1000, 5_000_000]) {
      expect(toMajor(toCents(v))).toBe(v);
    }
  });

  it('pas d\'arrondi flottant sur accumulation (centimes entiers)', () => {
    // 0.1 + 0.2 en majeur = 0.30000000000000004 en float ; en centimes : exact.
    const sum = toCents(0.1) + toCents(0.2);
    expect(sum).toBe(30n);
    expect(toMajor(sum)).toBe(0.3);
  });
});
