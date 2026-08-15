import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembersService } from './members.service';
import { encryptField } from '../../../common/security/pii-crypto';

type TxMock = {
  merchantMember: { findFirst: jest.Mock; update: jest.Mock };
  $queryRaw: jest.Mock;
};
type PrismaMock = {
  merchantMember: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

function makeService() {
  const tx: TxMock = {
    merchantMember: { findFirst: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const prisma: PrismaMock = {
    merchantMember: { findMany: jest.fn() },
    $transaction: jest.fn((cb: (tx: TxMock) => unknown) => cb(tx)),
  };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new MembersService(prisma as never, events as never);
  return { service, prisma, tx, events };
}

describe('MembersService (mutations transactionnelles + audit)', () => {
  it('list() décrypte les emails et exclut les membres REMOVED', async () => {
    const { service, prisma } = makeService();
    prisma.merchantMember.findMany.mockResolvedValue([
      {
        id: 'mem1',
        userId: 'u1',
        role: 'MANAGER',
        status: 'ACTIVE',
        invitedAt: null,
        joinedAt: new Date('2026-08-01'),
        suspendedAt: null,
        user: { emailEncrypted: encryptField('jean@example.com'), fullName: 'Jean' },
      },
    ]);

    const result = await service.list('m1');

    expect(prisma.merchantMember.findMany).toHaveBeenCalledWith({
      where: { merchantId: 'm1', status: { not: 'REMOVED' } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([
      expect.objectContaining({ id: 'mem1', email: 'jean@example.com', fullName: 'Jean', role: 'MANAGER' }),
    ]);
  });

  it('changeRole() met à jour le rôle et journalise ROLE_CHANGED', async () => {
    const { service, tx, events } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'MEMBER', status: 'ACTIVE' });
    tx.merchantMember.update.mockResolvedValue({ id: 'mem1', role: 'MANAGER' });

    const result = await service.changeRole('m1', 'mem1', 'MANAGER', { userId: 'actor', role: 'ADMIN' });

    expect(tx.merchantMember.update).toHaveBeenCalledWith({ where: { id: 'mem1' }, data: { role: 'MANAGER' } });
    expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({
      merchantId: 'm1', memberId: 'mem1', actorUserId: 'actor', eventType: 'ROLE_CHANGED',
      metadata: { from: 'MEMBER', to: 'MANAGER' },
    }));
    expect(result).toEqual({ id: 'mem1', role: 'MANAGER' });
  });

  it("changeRole() rejette l'anti-escalade (acteur de rang insuffisant)", async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'ADMIN', status: 'ACTIVE' });

    await expect(
      service.changeRole('m1', 'mem1', 'MEMBER', { userId: 'actor', role: 'MANAGER' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.merchantMember.update).not.toHaveBeenCalled();
  });

  it("changeRole() rejette l'attribution d'un rôle >= au sien", async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'MEMBER', status: 'ACTIVE' });

    await expect(
      service.changeRole('m1', 'mem1', 'ADMIN', { userId: 'actor', role: 'ADMIN' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.merchantMember.update).not.toHaveBeenCalled();
  });

  it('changeRole() rejette si le membre est introuvable', async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue(null);

    await expect(
      service.changeRole('m1', 'mem1', 'MEMBER', { userId: 'actor', role: 'ADMIN' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('suspend() bloque une action sur OWNER via anti-escalade (aucun rang ne dépasse OWNER)', async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'owner-mem', role: 'OWNER', status: 'ACTIVE' });

    await expect(
      service.suspend('m1', 'owner-mem', { userId: 'owner-user', role: 'OWNER' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.merchantMember.update).not.toHaveBeenCalled();
  });

  it('suspend() suspend un membre ACTIVE et journalise MEMBER_SUSPENDED', async () => {
    const { service, tx, events } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'MEMBER', status: 'ACTIVE' });
    tx.merchantMember.update.mockResolvedValue({ id: 'mem1', status: 'SUSPENDED' });

    await service.suspend('m1', 'mem1', { userId: 'actor', role: 'ADMIN' });

    expect(tx.merchantMember.update).toHaveBeenCalledWith({
      where: { id: 'mem1' },
      data: { status: 'SUSPENDED', suspendedAt: expect.any(Date) },
    });
    expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'MEMBER_SUSPENDED' }));
  });

  it('reactivate() ne trouve rien si le membre ne porte pas le statut SUSPENDED attendu', async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue(null);

    await expect(
      service.reactivate('m1', 'mem1', { userId: 'actor', role: 'ADMIN' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('reactivate() réactive un membre SUSPENDED et journalise MEMBER_REACTIVATED', async () => {
    const { service, tx, events } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'MEMBER', status: 'SUSPENDED' });
    tx.merchantMember.update.mockResolvedValue({ id: 'mem1', status: 'ACTIVE' });

    await service.reactivate('m1', 'mem1', { userId: 'actor', role: 'ADMIN' });

    expect(tx.merchantMember.update).toHaveBeenCalledWith({
      where: { id: 'mem1' },
      data: { status: 'ACTIVE', suspendedAt: null },
    });
    expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'MEMBER_REACTIVATED' }));
  });

  it('remove() retire (soft-delete) un membre et journalise MEMBER_REMOVED', async () => {
    const { service, tx, events } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'MEMBER', status: 'ACTIVE' });
    tx.merchantMember.update.mockResolvedValue({ id: 'mem1', status: 'REMOVED' });

    await service.remove('m1', 'mem1', { userId: 'actor', role: 'ADMIN' });

    expect(tx.merchantMember.update).toHaveBeenCalledWith({
      where: { id: 'mem1' },
      data: { status: 'REMOVED', removedAt: expect.any(Date) },
    });
    expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'MEMBER_REMOVED' }));
  });

  it("remove() rejette l'anti-escalade entre pairs (MANAGER sur MANAGER)", async () => {
    const { service, tx } = makeService();
    tx.merchantMember.findFirst.mockResolvedValue({ id: 'mem1', role: 'MANAGER', status: 'ACTIVE' });

    await expect(
      service.remove('m1', 'mem1', { userId: 'actor', role: 'MANAGER' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
