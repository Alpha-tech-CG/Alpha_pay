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

  describe('createWalletUploadUrl', () => {
    it('rejette si le bucket est absent', async () => {
      delete process.env.KYC_DOCUMENTS_BUCKET;
      const service = new KycDocumentStorageService();
      await expect(service.createWalletUploadUrl('w1', 'ID_FRONT', 'image/jpeg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('rejette un content-type non supporté', async () => {
      const service = new KycDocumentStorageService();
      await expect(service.createWalletUploadUrl('w1', 'ID_FRONT', 'image/gif' as any)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('génère une clé sous wallets/<id>/kyc/<type>/ et une URL présignée', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example/presigned-put');
      const service = new KycDocumentStorageService();

      const result = await service.createWalletUploadUrl('w1', 'ID_FRONT', 'image/jpeg');

      expect(result.key).toMatch(/^wallets\/w1\/kyc\/ID_FRONT\/.+\.jpg$/);
      expect(result.uploadUrl).toBe('https://s3.example/presigned-put');
      expect(result.expiresInSeconds).toBe(300);
    });
  });

  describe('verifyWalletUploadedDocument', () => {
    it("rejette une clé qui n'appartient pas à ce wallet/type (sans appeler S3)", async () => {
      const service = new KycDocumentStorageService();
      await expect(
        service.verifyWalletUploadedDocument('wallets/other-wallet/kyc/ID_FRONT/x.jpg', 'w1', 'ID_FRONT'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('rejette une clé contenant ".." (path traversal)', async () => {
      const service = new KycDocumentStorageService();
      await expect(
        service.verifyWalletUploadedDocument('wallets/w1/kyc/ID_FRONT/../../secret', 'w1', 'ID_FRONT'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("rejette si l'objet S3 n'est pas chiffré", async () => {
      sendMock.mockResolvedValue({ ServerSideEncryption: undefined, ContentLength: 1000 });
      const service = new KycDocumentStorageService();
      await expect(
        service.verifyWalletUploadedDocument('wallets/w1/kyc/ID_FRONT/x.jpg', 'w1', 'ID_FRONT'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rejette un objet trop volumineux', async () => {
      sendMock.mockResolvedValue({ ServerSideEncryption: 'AES256', ContentLength: 11 * 1024 * 1024 });
      const service = new KycDocumentStorageService();
      await expect(
        service.verifyWalletUploadedDocument('wallets/w1/kyc/ID_FRONT/x.jpg', 'w1', 'ID_FRONT'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('accepte un objet chiffré de taille raisonnable', async () => {
      sendMock.mockResolvedValue({ ServerSideEncryption: 'AES256', ContentLength: 1000 });
      const service = new KycDocumentStorageService();
      await expect(
        service.verifyWalletUploadedDocument('wallets/w1/kyc/ID_FRONT/x.jpg', 'w1', 'ID_FRONT'),
      ).resolves.toBeUndefined();
    });
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
