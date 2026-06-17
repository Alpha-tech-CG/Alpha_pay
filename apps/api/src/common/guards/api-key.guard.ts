import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { parseApiKey, verifyApiKeySecret } from '../security/api-key';
import { isIpAllowed } from '../security/ip-allowlist';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey: string | undefined = request.headers['x-api-key'];

    if (!apiKey) throw new UnauthorizedException('X-API-Key manquant');

    // 1. Nouvelle clé hachée (pk_<mode>_<prefix>_<secret>) : lookup par prefix.
    const parsed = parseApiKey(apiKey);
    if (parsed) {
      const record = await this.prisma.apiKey.findUnique({
        where: { prefix: parsed.prefix },
        include: { merchant: { select: { id: true, name: true, isActive: true } } },
      });
      if (
        record &&
        !record.revokedAt &&
        record.merchant.isActive &&
        verifyApiKeySecret(parsed.secret, record.hashedSecret)
      ) {
        if (record.ipAllowlist.length > 0) {
          const ip = request.ip ?? request.socket?.remoteAddress ?? '';
          if (!isIpAllowed(ip, record.ipAllowlist)) throw new UnauthorizedException('IP non autorisée');
        }
        // Best-effort : trace de dernière utilisation.
        this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
        request.merchant = { id: record.merchant.id, name: record.merchant.name };
        request.apiKeyScopes = record.scopes;
        return true;
      }
      throw new UnauthorizedException('Clé API invalide');
    }

    // 2. Compat : clé legacy stockée en clair sur Merchant.apiKey.
    const merchant = await this.prisma.merchant.findUnique({
      where: { apiKey, isActive: true },
      select: { id: true, name: true },
    });
    if (!merchant) throw new UnauthorizedException('Clé API invalide');

    request.merchant = merchant;
    return true;
  }
}
