import { generateApiKey, hashApiKeySecret, parseApiKey, verifyAgainstDummy, verifyApiKeySecret } from './api-key';

describe('api-key (ALP-136 + ALP-161 Argon2id)', () => {
  it('génère une clé au format ap_<mode>_<prefix>_<secret> (§7)', () => {
    const { full, prefix, secret } = generateApiKey('live');
    expect(prefix).toMatch(/^ap_live_[0-9a-f]{8}$/);
    expect(full).toBe(`${prefix}_${secret}`);
    expect(parseApiKey(full)).toEqual({ prefix, secret });
  });

  it('accepte encore les anciennes clés pk_… (émises avant la V1)', () => {
    expect(parseApiKey(`pk_test_0123abcd_${'x'.repeat(32)}`)).toEqual({ prefix: 'pk_test_0123abcd', secret: 'x'.repeat(32) });
    expect(parseApiKey(`zz_test_0123abcd_${'x'.repeat(32)}`)).toBeNull();
  });

  it('hash Argon2id + vérifie un secret (roundtrip)', async () => {
    const { secret } = generateApiKey('test');
    const hash = await hashApiKeySecret(secret);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyApiKeySecret(secret, hash)).toBe(true);
  });

  it('rejette un mauvais secret', async () => {
    const hash = await hashApiKeySecret('le-bon-secret');
    expect(await verifyApiKeySecret('mauvais-secret', hash)).toBe(false);
  });

  it('verifyAgainstDummy renvoie toujours false (anti-timing)', async () => {
    expect(await verifyAgainstDummy('nimporte-quoi')).toBe(false);
  });

  it('parse une clé valide et rejette une clé malformée', () => {
    const { full, prefix, secret } = generateApiKey('test');
    expect(parseApiKey(full)).toEqual({ prefix, secret });
    expect(parseApiKey('pas-une-cle')).toBeNull();
    expect(parseApiKey('pk_test_xx_secret')).toBeNull();
  });
});
