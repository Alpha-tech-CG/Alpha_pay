import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let prisma: any;
  let guard: ApiKeyGuard;

  function contextWith(headers: Record<string, string>) {
    const request: any = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  }

  beforeEach(() => {
    prisma = { merchant: { findUnique: jest.fn() } };
    guard = new ApiKeyGuard(prisma);
  });

  it('rejects a request with no X-API-Key header', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown or inactive API key', async () => {
    prisma.merchant.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextWith({ 'x-api-key': 'bogus-key' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid key and attaches the merchant to the request', async () => {
    prisma.merchant.findUnique.mockResolvedValue({ id: 'm-1', name: 'Alpha-Educ' });
    const request: any = { headers: { 'x-api-key': 'good-key' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.merchant).toEqual({ id: 'm-1', name: 'Alpha-Educ' });
  });
});
