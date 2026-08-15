import { UsersService } from './users.service';
import { deterministicHash, normalizeEmail } from '@paybrain/shared';

type PrismaMock = {
  appUser: {
    findUnique: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
};

function makeService() {
  const prisma: PrismaMock = {
    appUser: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new UsersService(prisma as never);
  return { service, prisma };
}

describe('UsersService (miroir app_users Team Members)', () => {
  it('findByClerkUserId délègue à prisma.appUser.findUnique', async () => {
    const { service, prisma } = makeService();
    prisma.appUser.findUnique.mockResolvedValue({ id: 'u1' });

    const result = await service.findByClerkUserId('clerk_1');

    expect(prisma.appUser.findUnique).toHaveBeenCalledWith({ where: { clerkUserId: 'clerk_1' } });
    expect(result).toEqual({ id: 'u1' });
  });

  it('upsertFromClerk met à jour un app_user existant (par clerkUserId)', async () => {
    const { service, prisma } = makeService();
    prisma.appUser.findUnique.mockResolvedValue({ id: 'u1', fullName: 'Ancien Nom' });
    prisma.appUser.update.mockResolvedValue({ id: 'u1' });

    await service.upsertFromClerk({ clerkUserId: 'clerk_1', email: '  Jean@Example.COM ', fullName: 'Nouveau Nom' });

    expect(prisma.appUser.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ fullName: 'Nouveau Nom' }),
    });
    expect(prisma.appUser.upsert).not.toHaveBeenCalled();
  });

  it('upsertFromClerk conserve le fullName existant si aucun nouveau nom fourni', async () => {
    const { service, prisma } = makeService();
    prisma.appUser.findUnique.mockResolvedValue({ id: 'u1', fullName: 'Ancien Nom' });
    prisma.appUser.update.mockResolvedValue({ id: 'u1' });

    await service.upsertFromClerk({ clerkUserId: 'clerk_1', email: 'jean@example.com' });

    expect(prisma.appUser.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ fullName: 'Ancien Nom' }),
    });
  });

  it('upsertFromClerk crée (ou rattache) un app_user par emailHash quand aucun clerkUserId ne matche', async () => {
    const { service, prisma } = makeService();
    prisma.appUser.findUnique.mockResolvedValue(null);
    prisma.appUser.upsert.mockResolvedValue({ id: 'u2' });

    const email = 'Jean.Dupont@Example.com';
    await service.upsertFromClerk({ clerkUserId: 'clerk_2', email, fullName: 'Jean Dupont' });

    const expectedHash = deterministicHash(normalizeEmail(email));
    expect(prisma.appUser.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.appUser.upsert.mock.calls[0][0];
    expect((call.where.emailHash as Buffer).equals(expectedHash)).toBe(true);
    expect(call.create).toEqual(
      expect.objectContaining({ clerkUserId: 'clerk_2', fullName: 'Jean Dupont' }),
    );
    expect(call.update).toEqual(expect.objectContaining({ clerkUserId: 'clerk_2' }));
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });

  it('markDeletedByClerkUserId détache le clerkUserId sans supprimer la ligne', async () => {
    const { service, prisma } = makeService();
    prisma.appUser.updateMany.mockResolvedValue({ count: 1 });

    await service.markDeletedByClerkUserId('clerk_1');

    expect(prisma.appUser.updateMany).toHaveBeenCalledWith({
      where: { clerkUserId: 'clerk_1' },
      data: { clerkUserId: null },
    });
  });
});
