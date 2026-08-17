import { WalletKycController } from './wallet-kyc.controller';
import { KycDocumentStorageService } from '../kyc/kyc-document-storage.service';

type PrismaMock = {
  walletKycDocument: { create: jest.Mock; findMany: jest.Mock };
  wallet: { findUnique: jest.Mock };
};

function makeController() {
  const prisma: PrismaMock = {
    walletKycDocument: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    wallet: { findUnique: jest.fn().mockResolvedValue({ kycLevel: 'N0' }) },
  };
  const storage = {
    createWalletUploadUrl: jest.fn(),
    verifyWalletUploadedDocument: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new WalletKycController(prisma as never, storage as unknown as KycDocumentStorageService);
  return { controller, prisma, storage };
}

const REQ = { wallet: { sub: 'w1' } };

describe('WalletKycController (upload direct S3, décision étape F item 2)', () => {
  it('createUploadUrl() délègue à storage.createWalletUploadUrl(walletId, type, mimeType)', async () => {
    const { controller, storage } = makeController();
    storage.createWalletUploadUrl.mockResolvedValue({ key: 'wallets/w1/kyc/ID_FRONT/x.jpg', uploadUrl: 'https://…' });

    const result = await controller.createUploadUrl(REQ as any, { type: 'ID_FRONT', mimeType: 'image/jpeg' } as any);

    expect(storage.createWalletUploadUrl).toHaveBeenCalledWith('w1', 'ID_FRONT', 'image/jpeg');
    expect(result).toEqual({ key: 'wallets/w1/kyc/ID_FRONT/x.jpg', uploadUrl: 'https://…' });
  });

  it("upload() vérifie l'objet S3 avant d'enregistrer le document", async () => {
    const { controller, prisma, storage } = makeController();

    const result = await controller.upload(REQ as any, {
      type: 'ID_FRONT',
      mimeType: 'image/jpeg',
      storageKey: 'wallets/w1/kyc/ID_FRONT/x.jpg',
    } as any);

    expect(storage.verifyWalletUploadedDocument).toHaveBeenCalledWith('wallets/w1/kyc/ID_FRONT/x.jpg', 'w1', 'ID_FRONT');
    expect(prisma.walletKycDocument.create).toHaveBeenCalledWith({
      data: { walletId: 'w1', type: 'ID_FRONT', mimeType: 'image/jpeg', storageKey: 'wallets/w1/kyc/ID_FRONT/x.jpg' },
    });
    expect(result).toEqual({ ok: true });
  });

  it("upload() n'enregistre rien si la vérification S3 échoue", async () => {
    const { controller, prisma, storage } = makeController();
    storage.verifyWalletUploadedDocument.mockRejectedValue(new Error('objet invalide'));

    await expect(
      controller.upload(REQ as any, { type: 'ID_FRONT', mimeType: 'image/jpeg', storageKey: 'bad' } as any),
    ).rejects.toThrow('objet invalide');
    expect(prisma.walletKycDocument.create).not.toHaveBeenCalled();
  });

  it('status() renvoie le niveau KYC et les documents sans données binaires', async () => {
    const { controller, prisma } = makeController();
    prisma.walletKycDocument.findMany.mockResolvedValue([{ id: 'd1', type: 'ID_FRONT', status: 'PENDING' }]);

    const result = await controller.status(REQ as any);

    expect(result).toEqual({ kycLevel: 'N0', documents: [{ id: 'd1', type: 'ID_FRONT', status: 'PENDING' }] });
  });
});
