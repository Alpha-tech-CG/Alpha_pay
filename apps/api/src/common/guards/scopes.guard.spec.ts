import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from './scopes.guard';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

function ctx(scopes: string[] | undefined) {
  const request: any = { apiKeyScopes: scopes };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function guardRequiring(required: string[] | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  return new ScopesGuard(reflector);
}

describe('ScopesGuard', () => {
  it('autorise si aucune route n’exige de scope', () => {
    expect(guardRequiring(undefined).canActivate(ctx(['payments:read']))).toBe(true);
  });

  it('autorise une clé non restreinte (scopes vides) = accès complet', () => {
    expect(guardRequiring(['payments:write']).canActivate(ctx([]))).toBe(true);
  });

  it('refuse une clé restreinte sans le scope requis', () => {
    expect(() =>
      guardRequiring(['payments:write']).canActivate(ctx(['payments:read'])),
    ).toThrow(ForbiddenException);
  });

  it('autorise une clé restreinte portant le scope requis', () => {
    expect(
      guardRequiring(['payments:write']).canActivate(ctx(['payments:read', 'payments:write'])),
    ).toBe(true);
  });
});
