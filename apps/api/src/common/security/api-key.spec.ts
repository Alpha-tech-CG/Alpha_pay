import { generateApiKey, hashApiKeySecret, parseApiKey, verifyApiKeySecret } from './api-key';

describe('api-key (ALP-136)', () => {
  it('génère une clé au format pk_<mode>_<prefix>_<secret>', () => {
    const { full, prefix, secret } = generateApiKey('live');
    expect(prefix).toMatch(/^pk_live_[0-9a-f]{8}$/);
    expect(full).toBe(`${prefix}_${secret}`);
  });

  it('hash + vérifie un secret (roundtrip)', () => {
    const { secret } = generateApiKey('test');
    const hash = hashApiKeySecret(secret);
    expect(hash).toContain(':');
    expect(verifyApiKeySecret(secret, hash)).toBe(true);
  });

  it('rejette un mauvais secret', () => {
    const hash = hashApiKeySecret('le-bon-secret')
    expect(verifyApiKeySecret('mauvais-secret', hash)).toBe(false);
  });

  it('parse une clé valide et rejette une clé malformée', () => {
    const { full, prefix, secret } = generateApiKey('test');
    expect(parseApiKey(full)).toEqual({ prefix, secret });
    expect(parseApiKey('pas-une-cle')).toBeNull();
    expect(parseApiKey('pk_test_xx_secret')).toBeNull(); // prefix non-hex 8
  });
});
