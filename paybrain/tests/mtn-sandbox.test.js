const { detectOperator, normalizePhone } = require('../src/utils/router');

describe('Router utilitaire', () => {
  test('détecte MTN Congo', () => {
    expect(detectOperator('242066123456')).toBe('MTN');
    expect(detectOperator('242067123456')).toBe('MTN');
    expect(detectOperator('242068123456')).toBe('MTN');
  });

  test('détecte Airtel Congo', () => {
    expect(detectOperator('242055123456')).toBe('AIRTEL');
    expect(detectOperator('242077123456')).toBe('AIRTEL');
  });

  test('détecte numéros sandbox MTN', () => {
    expect(detectOperator('46733123450')).toBe('MTN');
    expect(detectOperator('46733123451')).toBe('MTN');
    expect(detectOperator('46733123452')).toBe('MTN');
  });

  test('rejette numéro sans 242', () => {
    expect(() => detectOperator('0660000000')).toThrow();
  });

  test('normalise un numéro local congolais', () => {
    expect(normalizePhone('066123456')).toBe('242066123456');
  });

  test('laisse intact un numéro déjà normalisé', () => {
    expect(normalizePhone('242066123456')).toBe('242066123456');
  });

  test('rejette préfixe inconnu', () => {
    expect(() => detectOperator('242099123456')).toThrow('Opérateur non reconnu');
  });
});
