import { detectOperator } from '@paybrain/shared';

// Verrouille le routage opérateur dont dépendent les connecteurs MTN/Airtel
// (payments.service choisit le connecteur via detectOperator).
describe('detectOperator (routage MTN / Airtel Congo)', () => {
  it.each(['242066123456', '242067000000', '242068999999'])('%s -> MTN', (n) => {
    expect(detectOperator(n)).toBe('MTN');
  });

  it.each(['242055123456', '242057000000', '242074999999', '242077000000'])('%s -> AIRTEL', (n) => {
    expect(detectOperator(n)).toBe('AIRTEL');
  });

  it('normalise un format local 0XXXXXXXX', () => {
    expect(detectOperator('055123456'.padStart(9, '0'))).toBe('AIRTEL');
  });

  it('numéro sandbox MTN reconnu', () => {
    expect(detectOperator('46733123450')).toBe('MTN');
  });

  it('préfixe inconnu -> erreur', () => {
    expect(() => detectOperator('242099000000')).toThrow();
  });
});
