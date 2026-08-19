import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletAdminController } from './wallet-admin.controller';

// Tests unitaires des endpoints de rattachement caissier (AVANT_PROD §0.7).
// Le controller ne dépend que de Prisma → instanciation directe avec un mock.
describe('WalletAdminController — rattachement caissier', () => {
  const makeController = (overrides: Record<string, any> = {}) => {
    const prisma = {
      wallet: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'w1', ...data })),
      },
      merchant: { findUnique: jest.fn() },
      ...overrides,
    };
    return { controller: new WalletAdminController(prisma as any), prisma };
  };

  describe('attachCashier', () => {
    it('rattache le wallet au marchand comme MERCHANT_CASHIER', async () => {
      const { controller, prisma } = makeController();
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', phone: '2420660001', status: 'ACTIVE' });
      prisma.merchant.findUnique.mockResolvedValue({ id: 'm1' });

      const res: any = await controller.attachCashier('w1', { merchantId: 'm1', officer: 'ops@paybrain.io' });

      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'w1' }, data: { merchantId: 'm1', role: 'MERCHANT_CASHIER' } }),
      );
      expect(res.role).toBe('MERCHANT_CASHIER');
      expect(res.merchantId).toBe('m1');
    });

    it('404 si le wallet est introuvable', async () => {
      const { controller, prisma } = makeController();
      prisma.wallet.findUnique.mockResolvedValue(null);
      await expect(controller.attachCashier('wX', { merchantId: 'm1', officer: 'ops' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 si le marchand est introuvable', async () => {
      const { controller, prisma } = makeController();
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', phone: '2420660001', status: 'ACTIVE' });
      prisma.merchant.findUnique.mockResolvedValue(null);
      await expect(controller.attachCashier('w1', { merchantId: 'mX', officer: 'ops' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 si le wallet est clôturé', async () => {
      const { controller, prisma } = makeController();
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', phone: '2420660001', status: 'CLOSED' });
      await expect(controller.attachCashier('w1', { merchantId: 'm1', officer: 'ops' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('detachCashier', () => {
    it('détache le caissier → redevient CLIENT sans marchand', async () => {
      const { controller, prisma } = makeController();
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', phone: '2420660001', role: 'MERCHANT_CASHIER', merchantId: 'm1' });

      const res: any = await controller.detachCashier('w1', { officer: 'ops', reason: 'mutation' });

      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'w1' }, data: { merchantId: null, role: 'CLIENT' } }),
      );
      expect(res.merchantId).toBeNull();
      expect(res.role).toBe('CLIENT');
    });

    it('400 si le wallet n’est pas rattaché', async () => {
      const { controller, prisma } = makeController();
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', phone: '2420660001', role: 'CLIENT', merchantId: null });
      await expect(controller.detachCashier('w1', { officer: 'ops', reason: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
