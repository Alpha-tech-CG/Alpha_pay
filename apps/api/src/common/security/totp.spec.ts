import { base32Decode, base32Encode, generateTotpSecret, hotp, totpStep, totpUri, verifyTotp } from './totp';

// Secret de référence des RFC 4226/6238 : « 12345678901234567890 ».
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP (RFC 6238)', () => {
  it('reproduit les vecteurs de test HOTP de la RFC 4226', () => {
    expect([0, 1, 2, 3, 9].map((c) => hotp(RFC_SECRET, c))).toEqual(['755224', '287082', '359152', '969429', '520489']);
  });

  it('reproduit les vecteurs TOTP SHA-1 de la RFC 6238 (6 derniers chiffres)', () => {
    const secret = base32Encode(RFC_SECRET);
    for (const [t, expected] of [[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']] as const) {
      expect(verifyTotp(secret, expected, t * 1000)).toBe(totpStep(t * 1000));
    }
  });

  it('tolère un pas de décalage, refuse au-delà et les formats invalides', () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const code = hotp(base32Decode(secret), totpStep(now) - 1);
    expect(verifyTotp(secret, code, now)).toBe(totpStep(now) - 1);
    expect(verifyTotp(secret, hotp(base32Decode(secret), totpStep(now) - 3), now)).toBeNull();
    expect(verifyTotp(secret, 'abc123', now)).toBeNull();
    expect(verifyTotp(secret, '', now)).toBeNull();
  });

  it('base32 aller-retour, secret de 160 bits, URI otpauth', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(totpUri(secret, 'agent@alphapay.cg')).toMatch(/^otpauth:\/\/totp\/AlphaPay%20Back-office%3Aagent%40alphapay\.cg\?secret=[A-Z2-7]+&issuer=/);
  });
});
