import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@paybrain/database';
import { InvitationsService } from './invitations.service';
import { deterministicHash, encryptField } from '../../../common/security/pii-crypto';

type TxMock = {
  merchantInvitation: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findUniqueOrThrow: jest.Mock };
  merchantMember: { upsert: jest.Mock };
  $queryRaw: jest.Mock;
};
type PrismaMock = {
  merchantInvitation: { findMany: jest.Mock; findUnique: jest.Mock };
  $transaction: jest.Mock;
};

function makeService() {
  const tx: TxMock = {
    merchantInvitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    merchantMember: { upsert: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const prisma: PrismaMock = {
    merchantInvitation: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((cb: (tx: TxMock) => unknown) => cb(tx)),
  };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new InvitationsService(prisma as never, events as never, notifications as never);
  return { service, prisma, tx, events, notifications };
}

describe('InvitationsService', () => {
  describe('create', () => {
    it("rejette l'invitation d'un OWNER (réservé au transfert de propriété)", async () => {
      const { service, prisma } = makeService();
      await expect(
        service.create('m1', { email: 'a@b.com', role: 'OWNER' }, { userId: 'actor', role: 'OWNER' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejette un MANAGER qui tente d\'inviter un ADMIN (team:invite_admin requis)', async () => {
      const { service } = makeService();
      await expect(
        service.create('m1', { email: 'a@b.com', role: 'ADMIN' }, { userId: 'actor', role: 'MANAGER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('crée une invitation, journalise INVITATION_SENT, et envoie le lien UNIQUEMENT par email', async () => {
      const { service, tx, events, notifications } = makeService();
      tx.merchantInvitation.create.mockResolvedValue({
        id: 'inv1',
        role: 'MANAGER',
        expiresAt: new Date('2026-08-22'),
        merchant: { name: 'Ma Boutique' },
      });

      const result = await service.create(
        'm1',
        { email: 'Nouveau@Example.com', role: 'MANAGER' },
        { userId: 'actor', role: 'ADMIN' },
      );

      expect(tx.merchantInvitation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ merchantId: 'm1', role: 'MANAGER', invitedById: 'actor' }),
      }));
      expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({
        merchantId: 'm1', actorUserId: 'actor', eventType: 'INVITATION_SENT',
      }));
      expect(notifications.send).toHaveBeenCalledTimes(1);
      const sendArgs = notifications.send.mock.calls[0][0];
      expect(sendArgs.channel).toBe('EMAIL');
      expect(sendArgs.to).toBe('nouveau@example.com');
      expect(sendArgs.template).toBe('team.invitation');
      expect(sendArgs.data.link).toMatch(/\?token=[A-Za-z0-9_-]{20,}$/);
      // Le résultat renvoyé à l'appelant ne contient jamais le token en clair.
      expect(result).toEqual({ id: 'inv1', email: 'nouveau@example.com', role: 'MANAGER', expiresAt: new Date('2026-08-22') });
      expect(JSON.stringify(result)).not.toContain(sendArgs.data.link.split('token=')[1]);
    });

    it('convertit un conflit DB (index partiel « 1 invitation pending ») en ConflictException', async () => {
      const { service, prisma, notifications } = makeService();
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );

      await expect(
        service.create('m1', { email: 'a@b.com', role: 'MEMBER' }, { userId: 'actor', role: 'ADMIN' }),
      ).rejects.toThrow(ConflictException);
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('masque les emails et dérive le statut (PENDING/ACCEPTED/REVOKED/EXPIRED)', async () => {
      const { service, prisma } = makeService();
      const future = new Date(Date.now() + 86_400_000);
      const past = new Date(Date.now() - 86_400_000);
      prisma.merchantInvitation.findMany.mockResolvedValue([
        { id: 'i1', emailEncrypted: encryptField('a@b.com'), role: 'MEMBER', expiresAt: future, acceptedAt: null, revokedAt: null, createdAt: future },
        { id: 'i2', emailEncrypted: encryptField('c@d.com'), role: 'MEMBER', expiresAt: future, acceptedAt: new Date(), revokedAt: null, createdAt: future },
        { id: 'i3', emailEncrypted: encryptField('e@f.com'), role: 'MEMBER', expiresAt: future, acceptedAt: null, revokedAt: new Date(), createdAt: future },
        { id: 'i4', emailEncrypted: encryptField('g@h.com'), role: 'MEMBER', expiresAt: past, acceptedAt: null, revokedAt: null, createdAt: past },
      ]);

      const result = await service.list('m1');

      expect(result.map((r) => r.status)).toEqual(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']);
      expect(result[0].email).toBe('**@b.com');
    });
  });

  describe('revoke', () => {
    it('révoque une invitation en attente et journalise INVITATION_REVOKED', async () => {
      const { service, tx, events } = makeService();
      tx.merchantInvitation.findFirst.mockResolvedValue({ id: 'inv1', acceptedAt: null, revokedAt: null });
      tx.merchantInvitation.update.mockResolvedValue({ id: 'inv1', revokedAt: new Date() });

      await service.revoke('m1', 'inv1', { userId: 'actor', role: 'ADMIN' });

      expect(tx.merchantInvitation.update).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'INVITATION_REVOKED' }));
    });

    it('est idempotent si déjà révoquée', async () => {
      const { service, tx, events } = makeService();
      tx.merchantInvitation.findFirst.mockResolvedValue({ id: 'inv1', acceptedAt: null, revokedAt: new Date() });

      await service.revoke('m1', 'inv1', { userId: 'actor', role: 'ADMIN' });

      expect(tx.merchantInvitation.update).not.toHaveBeenCalled();
      expect(events.record).not.toHaveBeenCalled();
    });

    it('rejette si déjà acceptée', async () => {
      const { service, tx } = makeService();
      tx.merchantInvitation.findFirst.mockResolvedValue({ id: 'inv1', acceptedAt: new Date(), revokedAt: null });

      await expect(service.revoke('m1', 'inv1', { userId: 'actor', role: 'ADMIN' })).rejects.toThrow(ConflictException);
    });

    it('rejette si introuvable', async () => {
      const { service, tx } = makeService();
      tx.merchantInvitation.findFirst.mockResolvedValue(null);

      await expect(service.revoke('m1', 'inv1', { userId: 'actor', role: 'ADMIN' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('preview', () => {
    it('retourne un aperçu sans donnée sensible (email masqué, pas de hash)', async () => {
      const { service, prisma } = makeService();
      prisma.merchantInvitation.findUnique.mockResolvedValue({
        role: 'MANAGER',
        emailEncrypted: encryptField('jean@example.com'),
        expiresAt: new Date(Date.now() + 1000),
        revokedAt: null,
        acceptedAt: null,
        merchant: { name: 'Ma Boutique' },
      });

      const result = await service.preview('tok');

      expect(result).toEqual({
        merchantName: 'Ma Boutique',
        role: 'MANAGER',
        email: 'je***@example.com',
        expired: false,
        revoked: false,
        accepted: false,
      });
    });

    it('rejette si le token ne correspond à aucune invitation', async () => {
      const { service, prisma } = makeService();
      prisma.merchantInvitation.findUnique.mockResolvedValue(null);
      await expect(service.preview('tok')).rejects.toThrow(NotFoundException);
    });
  });

  describe('accept', () => {
    const baseInvitation = {
      id: 'inv1',
      merchantId: 'm1',
      role: 'MANAGER',
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 1000),
      createdAt: new Date('2026-08-01'),
      emailHash: deterministicHash('jean@example.com'),
    };

    it('rejette si le token ne correspond à aucune invitation (lock vide)', async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([]);
      await expect(service.accept('tok', { id: 'u1', email: 'jean@example.com' })).rejects.toThrow(NotFoundException);
    });

    it('rejette une invitation révoquée', async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([{ id: 'inv1' }]);
      tx.merchantInvitation.findUniqueOrThrow.mockResolvedValue({ ...baseInvitation, revokedAt: new Date() });
      await expect(service.accept('tok', { id: 'u1', email: 'jean@example.com' })).rejects.toThrow(ForbiddenException);
    });

    it('rejette une invitation déjà acceptée', async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([{ id: 'inv1' }]);
      tx.merchantInvitation.findUniqueOrThrow.mockResolvedValue({ ...baseInvitation, acceptedAt: new Date() });
      await expect(service.accept('tok', { id: 'u1', email: 'jean@example.com' })).rejects.toThrow(ConflictException);
    });

    it('rejette une invitation expirée', async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([{ id: 'inv1' }]);
      tx.merchantInvitation.findUniqueOrThrow.mockResolvedValue({ ...baseInvitation, expiresAt: new Date(Date.now() - 1000) });
      await expect(service.accept('tok', { id: 'u1', email: 'jean@example.com' })).rejects.toThrow(ForbiddenException);
    });

    it("rejette si le compte n'a pas d'email vérifiable", async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([{ id: 'inv1' }]);
      tx.merchantInvitation.findUniqueOrThrow.mockResolvedValue(baseInvitation);
      await expect(service.accept('tok', { id: 'u1', email: null })).rejects.toThrow(ForbiddenException);
    });

    it("rejette si l'email du compte ne correspond pas à celui invité", async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([{ id: 'inv1' }]);
      tx.merchantInvitation.findUniqueOrThrow.mockResolvedValue(baseInvitation);
      await expect(
        service.accept('tok', { id: 'u1', email: 'autre@example.com' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepte : crée le membership ACTIVE, marque acceptedAt, journalise INVITATION_ACCEPTED', async () => {
      const { service, tx, events } = makeService();
      tx.$queryRaw.mockResolvedValue([{ id: 'inv1' }]);
      tx.merchantInvitation.findUniqueOrThrow.mockResolvedValue(baseInvitation);
      tx.merchantMember.upsert.mockResolvedValue({ id: 'mem1', role: 'MANAGER', status: 'ACTIVE' });

      const result = await service.accept('tok', { id: 'u1', email: 'jean@example.com' });

      expect(tx.merchantMember.upsert).toHaveBeenCalledWith({
        where: { merchantId_userId: { merchantId: 'm1', userId: 'u1' } },
        create: expect.objectContaining({ merchantId: 'm1', userId: 'u1', role: 'MANAGER', status: 'ACTIVE' }),
        update: expect.objectContaining({ role: 'MANAGER', status: 'ACTIVE' }),
      });
      expect(tx.merchantInvitation.update).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: { acceptedAt: expect.any(Date) },
      });
      expect(events.record).toHaveBeenCalledWith(tx, expect.objectContaining({
        merchantId: 'm1', memberId: 'mem1', actorUserId: 'u1', eventType: 'INVITATION_ACCEPTED',
      }));
      expect(result).toEqual({ id: 'mem1', role: 'MANAGER', status: 'ACTIVE' });
    });
  });
});
