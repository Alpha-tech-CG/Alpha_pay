import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { generateApiKey, hashApiKeySecret } from '../security/api-key';

describe('ApiKeyGuard', () => {
  let prisma: any;
  let guard: ApiKeyGuard;

  function contextWith(headers: Record<string, string>) {
    const request: any = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      _request: request,
    } as any;
  }

  beforeEach(() => {
    prisma = {
      apiKey: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      merchant: { findUnique: jest.fn() },
    };
    guard = new ApiKeyGuard(prisma);
  });

  it('rejects a request with no X-API-Key header', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown API key prefix', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextWith({ 'x-api-key': 'pk_test_deadbeef_' + 'x'.repeat(24) })),
    ).rejects.toThrow(UnauthorizedException);
  });

  // Régression sécurité (ALP-VULN) : une clé legacy en clair ne doit JAMAIS
  // authentifier, même si un marchand existe — le chemin legacy est supprimé.
  it('rejects a legacy plaintext key even if a merchant row exists', async () => {
    prisma.merchant.findUnique.mockResolvedValue({ id: 'm-1', name: 'Alpha-Educ' });
    await expect(
      guard.canActivate(contextWith({ 'x-api-key': 'paybrain-key-alpha-educ-2026' })),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.merchant.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid hashed key and attaches the merchant to the request', async () => {
    const { full, prefix, secret } = generateApiKey('test');
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'k-1',
      prefix,
      hashedSecret: await hashApiKeySecret(secret),
      revokedAt: null,
      scopes: [],
      ipAllowlist: [],
      merchant: { id: 'm-1', name: 'Alpha-Educ', isActive: true },
    });
    const request: any = { headers: { 'x-api-key': full } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.merchant).toEqual({ id: 'm-1', name: 'Alpha-Educ' });
  });
});
