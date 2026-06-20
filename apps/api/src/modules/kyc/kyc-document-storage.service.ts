import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { KycDocumentType } from '@paybrain/database';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

@Injectable()
export class KycDocumentStorageService {
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION ?? 'af-south-1' });

  async createUploadUrl(merchantId: string, caseId: string, type: KycDocumentType, contentType: string) {
    const bucket = process.env.KYC_DOCUMENTS_BUCKET;
    if (!bucket) throw new ServiceUnavailableException('Stockage KYC non configuré');
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
    const bucket = process.env.KYC_DOCUMENTS_BUCKET;
    if (!bucket) throw new ServiceUnavailableException('Stockage KYC non configuré');
    const object = await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.ServerSideEncryption || object.ContentLength == null || object.ContentLength <= 0 || object.ContentLength > 10 * 1024 * 1024) {
      throw new ServiceUnavailableException('Document KYC invalide, non chiffré ou trop volumineux');
    }
  }
}
