import { decryptField, deterministicHash, encryptField, maskEmail, maskPhone, normalizeEmail } from './pii-crypto';

describe('pii-crypto (ALP-164)', () => {
  it('normalise les emails avant chiffrement et indexation', () => {
    expect(normalizeEmail('  Jean.Dupont@Example.COM ')).toBe('jean.dupont@example.com');
  });

  it('chiffre puis déchiffre (roundtrip AES-256-GCM enveloppe)', () => {
    const blob = encryptField('+242066123456');
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(decryptField(blob)).toBe('+242066123456');
  });

  it('produit un ciphertext différent à chaque appel (IV/DEK aléatoires)', () => {
    expect(encryptField('+242066123456').equals(encryptField('+242066123456'))).toBe(false);
  });

  it('le blob ne contient pas la valeur en clair', () => {
    const blob = encryptField('+242066123456');
    expect(blob.toString('utf8')).not.toContain('242066123456');
    expect(blob.toString('latin1')).not.toContain('242066123456');
  });

  it('hash déterministe : même entrée -> même hash (recherchable)', () => {
    expect(deterministicHash('+242066123456').equals(deterministicHash('+242066123456'))).toBe(true);
    expect(deterministicHash('+242066123456').equals(deterministicHash('+242066000000'))).toBe(false);
  });

  it('échoue à déchiffrer un blob altéré (intégrité GCM)', () => {
    const blob = encryptField('secret');
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptField(blob)).toThrow();
  });

  it('masque téléphone et email', () => {
    expect(maskPhone('+242066123456')).toBe('242*****3456');
    expect(maskEmail('jean.dupont@example.com')).toBe('je***@example.com');
  });
});
