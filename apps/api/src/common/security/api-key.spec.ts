import { generateApiKey, hashApiKeySecret, parseApiKey, verifyAgainstDummy, verifyApiKeySecret } from './api-key';

describe('api-key (ALP-136 + ALP-161 Argon2id)', () => {
  it('génère une clé au format pk_<mode>_<prefix>_<secret>', () => {
    const { full, prefix, secret } = generateApiKey('live');
    expect(prefix).toMatch(/^pk_live_[0-9a-f]{8}$/);
    expect(full).toBe(`${prefix}_${secret}`);
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
