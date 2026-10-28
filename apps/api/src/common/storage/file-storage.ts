import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve } from 'path';
import { createS3Client } from './s3-client';

/**
 * Stockage de fichiers (§M2, documents KYB). Le contenu est TOUJOURS chiffré
 * par l'API avant d'arriver ici (voir `encryptFile`) : le stockage ne voit que
 * du chiffré, quel qu'il soit.
 */
export abstract class FileStorage {
  abstract readonly name: string;
  abstract put(key: string, body: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

/** Disque local (développement, tests, petite instance) : `STORAGE_DIR`, par défaut ./var/storage. */
export class LocalDiskStorage extends FileStorage {
  readonly name = 'local';
  private readonly root: string;

  constructor(root = process.env.STORAGE_DIR ?? join(process.cwd(), 'var', 'storage')) {
    super();
    this.root = resolve(root);
  }

  private path(key: string): string {
    const p = resolve(this.root, normalize(key));
    if (!p.startsWith(this.root)) throw new Error('Clé de stockage invalide');
    return p;
  }

  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  get(key: string) {
    return readFile(this.path(key));
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

/** Stockage compatible S3 (OVH Object Storage, MinIO…) : `STORAGE_BUCKET`, `S3_ENDPOINT`. */
export class S3FileStorage extends FileStorage {
  readonly name = 's3';
  private readonly s3 = createS3Client('gra');

  constructor(private readonly bucket: string) {
    super();
  }

  async put(key: string, body: Buffer) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: 'application/octet-stream' }));
  }

  async get(key: string) {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function fileStorageFromEnv(): FileStorage {
  if (process.env.STORAGE_DRIVER === 's3') {
    if (!process.env.STORAGE_BUCKET) throw new Error('STORAGE_BUCKET requis avec STORAGE_DRIVER=s3');
    return new S3FileStorage(process.env.STORAGE_BUCKET);
  }
  return new LocalDiskStorage();
}

// ─── Chiffrement des fichiers ──────────────────────────────────────────────

const VERSION = 1;

/** Clé des documents : distincte des clés PII et opérateur, jamais stockée en base. */
function documentsKey(): Buffer {
  const b64 = process.env.DOCUMENTS_ENCRYPTION_KEY;
  if (b64) {
    const key = Buffer.from(b64, 'base64');
    if (key.length === 32) return key;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DOCUMENTS_ENCRYPTION_KEY (base64 32 octets) requis en production');
  return Buffer.alloc(32, 13);
}

/** AES-256-GCM, clé de données aléatoire par fichier, elle-même chiffrée par la clé maîtresse. */
export function encryptFile(plain: Buffer, kek: Buffer = documentsKey()): Buffer {
  const dek = randomBytes(32);
  const iv1 = randomBytes(12);
  const c1 = createCipheriv('aes-256-gcm', dek, iv1);
  const ct = Buffer.concat([c1.update(plain), c1.final()]);
  const tag1 = c1.getAuthTag();
  const iv2 = randomBytes(12);
  const c2 = createCipheriv('aes-256-gcm', kek, iv2);
  const encDek = Buffer.concat([c2.update(dek), c2.final()]);
  const tag2 = c2.getAuthTag();
  dek.fill(0);
  return Buffer.concat([Buffer.from([VERSION]), iv2, tag2, encDek, iv1, tag1, ct]);
}

export function decryptFile(blob: Buffer, kek: Buffer = documentsKey()): Buffer {
  if (blob[0] !== VERSION) throw new Error(`Fichier chiffré : version inconnue ${blob[0]}`);
  let off = 1;
  const take = (n: number) => blob.subarray(off, (off += n));
  const iv2 = take(12);
  const tag2 = take(16);
  const encDek = take(32);
  const iv1 = take(12);
  const tag1 = take(16);
  const ct = blob.subarray(off);
  const d2 = createDecipheriv('aes-256-gcm', kek, iv2);
  d2.setAuthTag(tag2);
  const dek = Buffer.concat([d2.update(encDek), d2.final()]);
  const d1 = createDecipheriv('aes-256-gcm', dek, iv1);
  d1.setAuthTag(tag1);
  const plain = Buffer.concat([d1.update(ct), d1.final()]);
  dek.fill(0);
  return plain;
}
