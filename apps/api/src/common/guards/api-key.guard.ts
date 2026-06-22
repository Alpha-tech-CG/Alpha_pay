import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { parseApiKey, verifyAgainstDummy, verifyApiKeySecret } from '../security/api-key';
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
      // Préfixe inconnu : on vérifie quand même contre un hash factice pour ne
      // pas révéler l'existence de la clé par le temps de réponse (anti-timing).
      if (!record) {
        await verifyAgainstDummy(parsed.secret);
        throw new UnauthorizedException('Clé API invalide');
      }
      if (
        !record.revokedAt &&
        record.merchant.isActive &&
        (await verifyApiKeySecret(parsed.secret, record.hashedSecret))
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

    // Format non reconnu : aucune clé legacy en clair n'est plus acceptée
    // (ALP-VULN : la comparaison en clair contournait hachage, révocation,
    // scopes et IP allowlist). Toute clé doit passer par le format haché pk_*.
    throw new UnauthorizedException('Clé API invalide');
  }
}
