import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

const cfg = (key: string) => new ConfigService({ ENCRYPTION_KEY: key });

describe('EncryptionService', () => {
  it('round-trips plaintext (AES-256-GCM)', () => {
    const svc = new EncryptionService(cfg(randomBytes(32).toString('hex')));
    const secret = 'Jean-Paul Kambou · CG-123456';
    const cipher = svc.encrypt(secret);
    expect(cipher).not.toContain(secret);
    expect(cipher.split('.')).toHaveLength(3); // iv.tag.payload
    expect(svc.decrypt(cipher)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const svc = new EncryptionService(cfg(randomBytes(32).toString('hex')));
    expect(svc.encrypt('same')).not.toBe(svc.encrypt('same'));
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new EncryptionService(cfg('deadbeef'))).toThrow(/32 bytes/);
  });

  it('fails to decrypt tampered ciphertext (auth tag)', () => {
    const svc = new EncryptionService(cfg(randomBytes(32).toString('hex')));
    const [iv, tag, data] = svc.encrypt('x').split('.');
    expect(() => svc.decrypt(`${iv}.${tag}.${data}ff`)).toThrow();
  });
});
