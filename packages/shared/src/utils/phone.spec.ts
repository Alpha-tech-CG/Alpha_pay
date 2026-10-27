import { detectOperator, InvalidPhoneError, operatorConfig, toE164 } from './phone';

describe('toE164 (§4.2)', () => {
  it.each([
    ['061234567', '+242061234567'],
    ['05 123 45 67', '+242051234567'],
    ['04-12-34-567', '+242041234567'],
    ['+242 06 123 4567', '+242061234567'],
    ['242061234567', '+242061234567'],
    ['00242061234567', '+242061234567'],
    ['+33612345678', '+33612345678'],
    ['46733123450', '+46733123450'],
  ])('%s → %s', (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each(['', 'abc', '61234567', '612345678', '+2420612345', '+0612345678', '06 12 34'])('refuse « %s »', (input) => {
    expect(() => toE164(input)).toThrow(InvalidPhoneError);
  });
});

describe('detectOperator', () => {
  it.each([
    ['061234567', 'MTN'],
    ['+242069999999', 'MTN'],
    ['051234567', 'AIRTEL'],
    ['041234567', 'AIRTEL'],
    ['46733123450', 'MTN'], // numéro de test du sandbox MTN
  ])('%s → %s', (input, operator) => {
    expect(detectOperator(input)).toBe(operator);
  });

  it('refuse un préfixe inconnu ou un numéro étranger (l’utilisateur doit choisir)', () => {
    expect(() => detectOperator('091234567')).toThrow(/préfixe 09/);
    expect(() => detectOperator('+33612345678')).toThrow(InvalidPhoneError);
  });

  it('lit les préfixes depuis la configuration, surchargeable par l’environnement', () => {
    process.env.PHONE_OPERATOR_PREFIXES = '{"MTN":["06","04"],"AIRTEL":["05"]}';
    try {
      expect(operatorConfig().prefixes.MTN).toEqual(['06', '04']);
      expect(detectOperator('041234567')).toBe('MTN');
    } finally {
      delete process.env.PHONE_OPERATOR_PREFIXES;
    }
  });

  it('retient le préfixe le plus long', () => {
    const config = { countryCode: '242', nationalNumberLength: 9, prefixes: { MTN: ['06'], AIRTEL: ['069'] } };
    expect(detectOperator('069123456', config)).toBe('AIRTEL');
    expect(detectOperator('061234567', config)).toBe('MTN');
  });
});
