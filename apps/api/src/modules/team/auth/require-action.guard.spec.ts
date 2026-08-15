import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireActionGuard } from './require-action.guard';
import { TEAM_ACTION_KEY } from './require-action.decorator';

function makeContext(req: any, action: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard(action: string | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(action) } as unknown as Reflector;
  return new RequireActionGuard(reflector);
}

describe('RequireActionGuard (RBAC route-level, TEAM_ACTION_KEY)', () => {
  it("laisse passer une route sans @RequireAction (métadonnée absente)", () => {
    const guard = makeGuard(undefined);
    const req = { membership: { merchantId: 'm1', role: 'VIEWER' } };
    expect(guard.canActivate(makeContext(req, undefined))).toBe(true);
  });

  it('rejette si req.membership est absent (RequireMemberGuard non exécuté)', () => {
    const guard = makeGuard('team:invite');
    expect(() => guard.canActivate(makeContext({}, 'team:invite'))).toThrow(ForbiddenException);
  });

  it("rejette si le rôle du membership n'a pas la capacité requise", () => {
    const guard = makeGuard('ownership:transfer');
    const req = { membership: { merchantId: 'm1', role: 'ADMIN' } };
    expect(() => guard.canActivate(makeContext(req, 'ownership:transfer'))).toThrow(ForbiddenException);
  });

  it('autorise si le rôle a la capacité requise', () => {
    const guard = makeGuard('team:invite');
    const req = { membership: { merchantId: 'm1', role: 'MANAGER' } };
    expect(guard.canActivate(makeContext(req, 'team:invite'))).toBe(true);
  });

  it('lit bien la métadonnée sous TEAM_ACTION_KEY via le Reflector', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RequireActionGuard(reflector);
    guard.canActivate(makeContext({}, undefined));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(TEAM_ACTION_KEY, expect.any(Array));
  });
});
