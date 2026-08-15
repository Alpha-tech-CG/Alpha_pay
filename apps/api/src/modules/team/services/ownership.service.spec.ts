import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

type TxMock = {
  merchantMember: { findFirst: jest.Mock; update: jest.Mock };
  merchant: { update: jest.Mock };
};
type PrismaMock = { $transaction: jest.Mock };

function makeService() {
  const tx: TxMock = {
    merchantMember: { findFirst: jest.fn(), update: jest.fn() },
    merchant: { update: jest.fn() },
  };
  const prisma: PrismaMock = { $transaction: jest.fn((cb: (tx: TxMock) => unknown) => cb(tx)) };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new OwnershipService(prisma as never, events as never);
  return { service, prisma, tx, events };
}

describe('OwnershipService.transfer (transfert atomique de propriété)', () => {
  it("rejette immédiatement si l'acteur n'est pas OWNER (sans ouvrir de transaction)", async () => {
    const { service, prisma } = makeService();

    await expect(
      service.transfer('m1', 'u2', { userId: 'u1', role: 'ADMIN' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejette si la DB ne confirme pas l'acteur comme OWNER actif (défense en profondeur)", async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValueOnce(null); // pas d'OWNER actif trouvé

    await expect(
      service.transfer('m1', 'u2', { userId: 'u1', role: 'OWNER' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejette si l'OWNER en DB ne correspond pas à l'acteur", async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValueOnce({ id: 'owner-mem', userId: 'someone-else', role: 'OWNER' });

    await expect(
      service.transfer('m1', 'u2', { userId: 'u1', role: 'OWNER' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejette si la cible est déjà OWNER (soi-même)', async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValueOnce({ id: 'owner-mem', userId: 'u1', role: 'OWNER' });

    await expect(
      service.transfer('m1', 'u1', { userId: 'u1', role: 'OWNER' }),
    ).rejects.toThrow(ConflictException);
  });

  it("rejette si la cible n'est pas membre actif du marchand", async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst
      .mockResolvedValueOnce({ id: 'owner-mem', userId: 'u1', role: 'OWNER' })
      .mockResolvedValueOnce(null);

    await expect(
      service.transfer('m1', 'u2', { userId: 'u1', role: 'OWNER' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejette si la cible porte déjà le rôle OWNER', async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst
      .mockResolvedValueOnce({ id: 'owner-mem', userId: 'u1', role: 'OWNER' })
      .mockResolvedValueOnce({ id: 'target-mem', userId: 'u2', role: 'OWNER' });

    await expect(
      service.transfer('m1', 'u2', { userId: 'u1', role: 'OWNER' }),
    ).rejects.toThrow(ConflictException);
  });

  it("transfère : démet l'ancien OWNER AVANT de promouvoir le nouveau, MAJ merchants.owner_user_id, journalise", async () => {
    const { service, tx, events } = makeService();
    tx.merchantMember.findFirst
      .mockResolvedValueOnce({ id: 'owner-mem', userId: 'u1', role: 'OWNER' })
      .mockResolvedValueOnce({ id: 'target-mem', userId: 'u2', role: 'ADMIN' });

    const calls: string[] = [];
    tx.merchantMember.update.mockImplementation(({ where, data }: any) => {
      calls.push(`member:${where.id}:${data.role}`);
      return Promise.resolve({ id: where.id, role: data.role });
    });
    tx.merchant.update.mockImplementation(({ data }: any) => {
      calls.push(`merchant:${data.ownerUserId}`);
      return Promise.resolve({ id: 'm1', ownerUserId: data.ownerUserId });
    });

    const result = await service.transfer('m1', 'u2', { userId: 'u1', role: 'OWNER' });

    expect(calls).toEqual(['member:owner-mem:ADMIN', 'member:target-mem:OWNER', 'merchant:u2']);
    expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({
      merchantId: 'm1', memberId: 'target-mem', actorUserId: 'u1', eventType: 'OWNERSHIP_TRANSFERRED',
      metadata: { fromUserId: 'u1', fromMemberId: 'owner-mem', toUserId: 'u2' },
    }));
    expect(result).toEqual({ fromMemberId: 'owner-mem', toMemberId: 'target-mem', toUserId: 'u2' });
  });
});
