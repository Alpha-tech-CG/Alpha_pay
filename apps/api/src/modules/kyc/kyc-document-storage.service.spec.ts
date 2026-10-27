import { ServiceUnavailableException } from '@nestjs/common';

const sendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));

// eslint-disable-next-line import/first
import { KycDocumentStorageService } from './kyc-document-storage.service';

describe('KycDocumentStorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    process.env = { ...originalEnv, KYC_DOCUMENTS_BUCKET: 'paybrain-kyc' };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createDownloadUrl', () => {
    it('retourne une URL de lecture présignée', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example/presigned-get');
      const service = new KycDocumentStorageService();
      await expect(service.createDownloadUrl('wallets/w1/kyc/ID_FRONT/x.jpg')).resolves.toBe(
        'https://s3.example/presigned-get',
      );
    });

    it('rejette si le bucket est absent', async () => {
      delete process.env.KYC_DOCUMENTS_BUCKET;
      const service = new KycDocumentStorageService();
      await expect(service.createDownloadUrl('wallets/w1/kyc/ID_FRONT/x.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // Coverage légère du chemin marchand (partage désormais getBucket()/headCheck() avec le wallet).
  describe('createUploadUrl / verifyUploadedDocument (marchand, régression du partage de code)', () => {
    it('createUploadUrl génère une clé sous merchants/.../cases/...', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example/presigned-put');
      const service = new KycDocumentStorageService();
      const result = await service.createUploadUrl('m1', 'c1', 'ID_FRONT' as any, 'image/png');
      expect(result.key).toMatch(/^merchants\/m1\/cases\/c1\/ID_FRONT\/.+\.png$/);
    });

    it('verifyUploadedDocument accepte un objet valide', async () => {
      sendMock.mockResolvedValue({ ServerSideEncryption: 'AES256', ContentLength: 500 });
      const service = new KycDocumentStorageService();
      await expect(
        service.verifyUploadedDocument('merchants/m1/cases/c1/ID_FRONT/x.png', 'm1', 'c1', 'ID_FRONT' as any),
      ).resolves.toBeUndefined();
    });
  });
});
