import { NotFoundException } from '@nestjs/common';
import { WalletKycAdminController } from './wallet-kyc-admin.controller';
import { KycDocumentStorageService } from '../kyc/kyc-document-storage.service';

type PrismaMock = { walletKycDocument: { findUnique: jest.Mock } };

function makeController() {
  const prisma: PrismaMock = { walletKycDocument: { findUnique: jest.fn() } };
  const storage = { createDownloadUrl: jest.fn() };
  const controller = new WalletKycAdminController(prisma as never, storage as unknown as KycDocumentStorageService);
  return { controller, prisma, storage };
}

describe('WalletKycAdminController.get (URL de lecture présignée, jamais dataBase64)', () => {
  it("ne renvoie jamais storageKey, seulement une downloadUrl présignée à courte durée", async () => {
    const { controller, prisma, storage } = makeController();
    prisma.walletKycDocument.findUnique.mockResolvedValue({
      id: 'd1',
      type: 'ID_FRONT',
      mimeType: 'image/jpeg',
      storageKey: 'wallets/w1/kyc/ID_FRONT/x.jpg',
      status: 'PENDING',
      reviewedBy: null,
      reviewReason: null,
      reviewedAt: null,
      createdAt: new Date('2026-08-01'),
      wallet: { id: 'w1', phone: '242066000001', fullName: 'Jean', kycLevel: 'N0', status: 'ACTIVE' },
    });
    storage.createDownloadUrl.mockResolvedValue('https://s3.example/presigned-get');

    const result = await controller.get('d1');

    expect(storage.createDownloadUrl).toHaveBeenCalledWith('wallets/w1/kyc/ID_FRONT/x.jpg');
    expect(result).not.toHaveProperty('storageKey');
    expect(result).not.toHaveProperty('dataBase64');
    expect(result.downloadUrl).toBe('https://s3.example/presigned-get');
    expect(result.id).toBe('d1');
  });

  it('404 si le document est introuvable (aucun appel S3)', async () => {
    const { controller, prisma, storage } = makeController();
    prisma.walletKycDocument.findUnique.mockResolvedValue(null);

    await expect(controller.get('missing')).rejects.toThrow(NotFoundException);
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
