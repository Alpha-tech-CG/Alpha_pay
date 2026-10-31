import { UnauthorizedException } from '@nestjs/common';
import { InternalGuard } from './internal.guard';

function ctx(token: unknown) {
  const request: any = { headers: token === undefined ? {} : { 'x-internal-token': token } };
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('InternalGuard', () => {
  const previous = process.env.INTERNAL_API_TOKEN;
  afterEach(() => {
    if (previous === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previous;
  });

  it('refuse tout quand le jeton interne n’est pas configuré', () => {
    delete process.env.INTERNAL_API_TOKEN;
    expect(() => new InternalGuard().canActivate(ctx('nimporte'))).toThrow(UnauthorizedException);
  });

  it('refuse une requête sans jeton', () => {
    process.env.INTERNAL_API_TOKEN = 'secret-interne';
    expect(() => new InternalGuard().canActivate(ctx(undefined))).toThrow(UnauthorizedException);
  });

  it('refuse un jeton faux, y compris de longueur différente', () => {
    process.env.INTERNAL_API_TOKEN = 'secret-interne';
    expect(() => new InternalGuard().canActivate(ctx('secret-internX'))).toThrow(UnauthorizedException);
    expect(() => new InternalGuard().canActivate(ctx('court'))).toThrow(UnauthorizedException);
  });

  it('refuse un en-tête répété (tableau)', () => {
    process.env.INTERNAL_API_TOKEN = 'secret-interne';
    expect(() => new InternalGuard().canActivate(ctx(['secret-interne']))).toThrow(UnauthorizedException);
  });

  it('autorise le bon jeton', () => {
    process.env.INTERNAL_API_TOKEN = 'secret-interne';
    expect(new InternalGuard().canActivate(ctx('secret-interne'))).toBe(true);
  });
});
