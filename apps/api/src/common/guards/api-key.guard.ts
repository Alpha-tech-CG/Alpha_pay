import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { parseApiKey, verifyAgainstDummy, verifyApiKeySecret } from '../security/api-key';
import { isIpAllowed } from '../security/ip-allowlist';
import { consumeApiKeyQuota, trackApiRequest } from '../security/api-usage';
import { KvStore } from '../kv/kv-store';
import { ApiError } from '../errors/api-error';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    // Absent quand le garde est instancié hors HTTP (passerelle WebSocket).
    @Optional() private readonly kv?: KvStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // §7 : « Authorization: Bearer <clé> » ; X-API-Key reste accepté.
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers['authorization'] ?? '')?.[1];
    const apiKey: string | undefined = bearer ?? request.headers['x-api-key'];

    if (!apiKey) throw new UnauthorizedException('Clé API manquante (Authorization: Bearer …)');

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
        request.apiKeyId = record.id;
        request.apiKeyScopes = record.scopes;
        // Mode test ou live porté par la clé (§4.6).
        request.livemode = record.mode === 'LIVE';

        // Requête HTTP : journal (30 j) puis limite par clé avec en-têtes RateLimit-* (T-56).
        const response = typeof context.getType === 'function' && context.getType() === 'http' ? context.switchToHttp().getResponse() : undefined;
        if (response?.setHeader) {
          trackApiRequest(this.prisma, request, response);
          if (this.kv && !(await consumeApiKeyQuota(this.kv, record.id, response))) {
            throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'trop_de_requetes', 'Limite de requêtes de cette clé atteinte, réessayez dans une minute.');
          }
        }
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
