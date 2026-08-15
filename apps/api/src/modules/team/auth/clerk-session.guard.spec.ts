import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { ClerkSessionGuard } from './clerk-session.guard';
import { UsersService } from '../../users/users.service';
import { encryptField } from '../../../common/security/pii-crypto';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
  createClerkClient: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.Mock;
const mockedCreateClerkClient = createClerkClient as jest.Mock;

function makeContext(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function makeGuard(secretKey: string | undefined = 'sk_test_xxx') {
  const config = { get: jest.fn().mockReturnValue(secretKey) } as unknown as ConfigService;
  const users = {
    findByClerkUserId: jest.fn(),
    upsertFromClerk: jest.fn(),
  } as unknown as jest.Mocked<UsersService>;
  const guard = new ClerkSessionGuard(config, users);
  return { guard, config, users };
}

describe('ClerkSessionGuard (auth Clerk Bearer — décision 1A)', () => {
  beforeEach(() => {
    mockedVerifyToken.mockReset();
    mockedCreateClerkClient.mockReset();
  });

  it("rejette si l'en-tête Authorization Bearer est absent", async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeContext({ headers: {} }))).rejects.toThrow(UnauthorizedException);
    expect(mockedVerifyToken).not.toHaveBeenCalled();
  });

  it('rejette si CLERK_SECRET_KEY est manquant', async () => {
    const { guard } = makeGuard(undefined);
    const req = { headers: { authorization: 'Bearer tok' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejette si verifyToken lève (session invalide/expirée)', async () => {
    const { guard } = makeGuard();
    mockedVerifyToken.mockRejectedValue(new Error('expired'));
    const req = { headers: { authorization: 'Bearer tok' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('pose req.appUser depuis un app_user déjà synchronisé (chemin rapide, sans appel API Clerk)', async () => {
    const { guard, users } = makeGuard();
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk_1' });
    (users.findByClerkUserId as jest.Mock).mockResolvedValue({
      id: 'u1',
      emailEncrypted: encryptField('jean@example.com'),
    });
    const req: any = { headers: { authorization: 'Bearer tok' } };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(req.appUser).toEqual({ id: 'u1', clerkUserId: 'clerk_1', email: 'jean@example.com' });
    expect(mockedCreateClerkClient).not.toHaveBeenCalled();
    expect(users.upsertFromClerk).not.toHaveBeenCalled();
  });

  it("repli API Clerk : upsert l'app_user manquant puis pose req.appUser", async () => {
    const { guard, users } = makeGuard();
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk_2' });
    (users.findByClerkUserId as jest.Mock).mockResolvedValue(null);
    const getUser = jest.fn().mockResolvedValue({
      emailAddresses: [{ id: 'ea1', emailAddress: 'nouveau@example.com' }],
      primaryEmailAddressId: 'ea1',
      firstName: 'Nouveau',
      lastName: 'Membre',
    });
    mockedCreateClerkClient.mockReturnValue({ users: { getUser } });
    (users.upsertFromClerk as jest.Mock).mockResolvedValue({
      id: 'u2',
      emailEncrypted: encryptField('nouveau@example.com'),
    });
    const req: any = { headers: { authorization: 'Bearer tok' } };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(getUser).toHaveBeenCalledWith('clerk_2');
    expect(users.upsertFromClerk).toHaveBeenCalledWith({
      clerkUserId: 'clerk_2',
      email: 'nouveau@example.com',
      fullName: 'Nouveau Membre',
    });
    expect(req.appUser).toEqual({ id: 'u2', clerkUserId: 'clerk_2', email: 'nouveau@example.com' });
  });

  it("rejette le repli si le compte Clerk n'a aucun email", async () => {
    const { guard, users } = makeGuard();
    mockedVerifyToken.mockResolvedValue({ sub: 'clerk_3' });
    (users.findByClerkUserId as jest.Mock).mockResolvedValue(null);
    mockedCreateClerkClient.mockReturnValue({
      users: { getUser: jest.fn().mockResolvedValue({ emailAddresses: [], primaryEmailAddressId: null }) },
    });
    const req: any = { headers: { authorization: 'Bearer tok' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(UnauthorizedException);
    expect(users.upsertFromClerk).not.toHaveBeenCalled();
  });
});
