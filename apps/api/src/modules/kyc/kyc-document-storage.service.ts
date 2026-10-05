import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { KycDocumentType, WalletKycDocType } from '@paybrain/database';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../../common/storage/s3-client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class KycDocumentStorageService {
  private readonly s3 = createS3Client('af-south-1');

  private getBucket(): string {
    const bucket = process.env.KYC_DOCUMENTS_BUCKET;
    if (!bucket) throw new ServiceUnavailableException('Stockage KYC non configuré');
    return bucket;
  }

  /* ── KYC marchand (Smile Identity) ── */

  async createUploadUrl(merchantId: string, caseId: string, type: KycDocumentType, contentType: string) {
    const bucket = this.getBucket();
    const extension = EXTENSIONS[contentType];
    if (!extension) throw new ServiceUnavailableException('Format de document KYC non supporté');
    const key = `merchants/${merchantId}/cases/${caseId}/${type}/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: { merchant: merchantId, case: caseId, type },
    });
    return {
      key,
      uploadUrl: await getSignedUrl(this.s3, command, { expiresIn: 300 }),
      expiresInSeconds: 300,
      requiredHeaders: { 'content-type': contentType, 'x-amz-server-side-encryption': 'AES256' },
    };
  }

  async verifyUploadedDocument(key: string, merchantId: string, caseId: string, type: KycDocumentType) {
    const prefix = `merchants/${merchantId}/cases/${caseId}/${type}/`;
    if (!key.startsWith(prefix) || key.includes('..')) throw new ServiceUnavailableException('Clé de document KYC invalide');
    await this.headCheck(key);
  }

  /* ── KYC wallet client (pièce d'identité N0 → N1) ── */

  async createWalletUploadUrl(walletId: string, type: WalletKycDocType, contentType: string) {
    const bucket = this.getBucket();
    const extension = EXTENSIONS[contentType];
    if (!extension) throw new ServiceUnavailableException('Format de document KYC non supporté');
    const key = `wallets/${walletId}/kyc/${type}/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: { wallet: walletId, type },
    });
    return {
      key,
      uploadUrl: await getSignedUrl(this.s3, command, { expiresIn: 300 }),
      expiresInSeconds: 300,
      requiredHeaders: { 'content-type': contentType, 'x-amz-server-side-encryption': 'AES256' },
    };
  }

  async verifyWalletUploadedDocument(key: string, walletId: string, type: WalletKycDocType) {
    const prefix = `wallets/${walletId}/kyc/${type}/`;
    if (!key.startsWith(prefix) || key.includes('..')) throw new ServiceUnavailableException('Clé de document KYC invalide');
    await this.headCheck(key);
  }

  /** URL de lecture courte durée — sert à l'admin pour afficher la pièce sans exposer le bucket. */
  async createDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.getBucket(), Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: 300 });
  }

  private async headCheck(key: string): Promise<void> {
    const object = await this.s3.send(new HeadObjectCommand({ Bucket: this.getBucket(), Key: key }));
    if (!object.ServerSideEncryption || object.ContentLength == null || object.ContentLength <= 0 || object.ContentLength > MAX_DOCUMENT_BYTES) {
      throw new ServiceUnavailableException('Document KYC invalide, non chiffré ou trop volumineux');
    }
  }
}
