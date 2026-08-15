import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RequireMemberGuard } from './require-member.guard';

type PrismaMock = { merchantMember: { findFirst: jest.Mock } };

function makeContext(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function makeGuard() {
  const prisma: PrismaMock = { merchantMember: { findFirst: jest.fn() } };
  const guard = new RequireMemberGuard(prisma as never);
  return { guard, prisma };
}

describe('RequireMemberGuard (isolation multi-tenant Team Members)', () => {
  it("rejette si req.appUser n'est pas posé (ClerkSessionGuard absent/échoué)", async () => {
    const { guard } = makeGuard();
    const req = { params: { merchantId: 'm1' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('rejette si merchantId absent du path', async () => {
    const { guard } = makeGuard();
    const req = { appUser: { id: 'u1' }, params: {} };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it("rejette si aucun membership ACTIVE pour ce marchand (n'existe pas ou n'est pas membre)", async () => {
    const { guard, prisma } = makeGuard();
    prisma.merchantMember.findFirst.mockResolvedValue(null);
    const req = { appUser: { id: 'u1' }, params: { merchantId: 'm1' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    expect(prisma.merchantMember.findFirst).toHaveBeenCalledWith({
      where: { merchantId: 'm1', userId: 'u1', status: 'ACTIVE' },
      select: { role: true },
    });
  });

  it('pose req.membership et autorise quand un membership ACTIVE existe', async () => {
    const { guard, prisma } = makeGuard();
    prisma.merchantMember.findFirst.mockResolvedValue({ role: 'MANAGER' });
    const req: any = { appUser: { id: 'u1' }, params: { merchantId: 'm1' } };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(req.membership).toEqual({ merchantId: 'm1', role: 'MANAGER' });
  });

  it("ignore un merchantId éventuel dans le body/query (seul le path fait foi)", async () => {
    const { guard, prisma } = makeGuard();
    prisma.merchantMember.findFirst.mockResolvedValue({ role: 'OWNER' });
    const req: any = {
      appUser: { id: 'u1' },
      params: { merchantId: 'path-merchant' },
      body: { merchantId: 'body-merchant' },
      query: { merchantId: 'query-merchant' },
    };

    await guard.canActivate(makeContext(req));

    expect(prisma.merchantMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ merchantId: 'path-merchant' }) }),
    );
  });
});
