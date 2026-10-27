import { formatAmount, toMajorAmount, toMinor } from './money';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('money (§4.1, D-007)', () => {
  it('XAF : entiers sans centimes (unité mineure = franc)', () => {
    expect(toMinor(15000, 'XAF')).toBe(15000n);
    expect(toMajorAmount(15000n, 'XAF')).toBe(15000);
  });

  it('EUR (sandbox MTN) : centimes', () => {
    expect(toMinor(100, 'EUR')).toBe(10000n);
    expect(toMinor(99.99, 'EUR')).toBe(9999n);
    expect(toMajorAmount(9999n, 'EUR')).toBe(99.99);
  });

  it('roundtrip stable', () => {
    for (const v of [1, 50, 1000, 5_000_000]) {
      expect(toMajorAmount(toMinor(v, 'XAF'), 'XAF')).toBe(v);
      expect(toMajorAmount(toMinor(v, 'EUR'), 'EUR')).toBe(v);
    }
  });

  it("pas d'arrondi flottant sur accumulation (entiers en unités mineures)", () => {
    const sum = toMinor(0.1, 'EUR') + toMinor(0.2, 'EUR');
    expect(sum).toBe(30n);
    expect(toMajorAmount(sum, 'EUR')).toBe(0.3);
  });

  it('refuse une devise inconnue', () => {
    expect(() => toMinor(1, 'ZZZ')).toThrow();
  });

  it.each([
    [15000n, 'XAF', '15 000 XAF'],
    [1500000n, 'XAF', '1 500 000 XAF'],
    [999n, 'XAF', '999 XAF'],
    [0n, 'XAF', '0 XAF'],
    [125050n, 'EUR', '1 250,50 EUR'],
    [5n, 'EUR', '0,05 EUR'],
    [-2500n, 'XAF', '-2 500 XAF'],
  ])('formatAmount(%s, %s) = « %s »', (minor, currency, expected) => {
    expect(plain(formatAmount(minor, currency))).toBe(expected);
  });

  it('utilise des espaces insécables (le montant ne se coupe pas)', () => {
    expect(formatAmount(15000n, 'XAF')).toBe('15 000 XAF');
  });
});
