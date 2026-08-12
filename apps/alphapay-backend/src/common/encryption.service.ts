import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM for PII at rest (names, national IDs, etc.). The key is a 32-byte
 * value provided as 64 hex chars in ENCRYPTION_KEY. Ciphertext format:
 * `iv(hex).authTag(hex).payload(hex)` — self-describing, so decrypt needs no extra state.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private static readonly ALGO = 'aes-256-gcm';
  private static readonly IV_LEN = 12;

  constructor(config: ConfigService) {
    const hex = config.get<string>('ENCRYPTION_KEY') ?? '';
    this.key = Buffer.from(hex, 'hex');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars). Generate: openssl rand -hex 32');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(EncryptionService.IV_LEN);
    const cipher = createCipheriv(EncryptionService.ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}.${tag.toString('hex')}.${enc.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, dataHex] = ciphertext.split('.');
    if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed ciphertext');
    const decipher = createDecipheriv(EncryptionService.ALGO, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
