import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ANY_MODE, PrismaClient, ProviderConnection } from '@paybrain/database';
import { HttpClient, ProviderError, TokenCache } from '@paybrain/providers';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { callbackUrl } from './callback-token';
import { decryptCredentials, encryptCredentials } from './credentials-crypto';
import { MOBILE_MONEY_FACTORIES, MOBILE_MONEY_HTTP, MobileMoneyOperator, TOKEN_CACHE } from './mobile-money.registry';

/** Champs à saisir par opérateur (libellés du formulaire de connexion). */
export const CREDENTIAL_FIELDS: Record<MobileMoneyOperator, { key: string; label: string }[]> = {
  MTN: [
    { key: 'subscriptionKey', label: "Clé d'abonnement Collection (Ocp-Apim-Subscription-Key)" },
    { key: 'apiUserId', label: 'Identifiant API user' },
    { key: 'apiKey', label: 'Clé API' },
  ],
  AIRTEL: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client secret' },
  ],
};

export const OPERATORS: MobileMoneyOperator[] = ['MTN', 'AIRTEL'];

export interface Actor {
  userId: string;
  ip?: string;
}

/**
 * Connexion du marchand à SON compte opérateur (§4.3, T-40). Les
 * identifiants ne sont jamais renvoyés, ni journalisés : seuls les noms des
 * champs renseignés et le statut sont exposés. Un compte de mode test pointe
 * vers le sandbox de l'opérateur, un compte live vers sa production.
 */
@Injectable()
export class ProviderConnectionsService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(TOKEN_CACHE) private readonly tokenCache: TokenCache,
    @Inject(MOBILE_MONEY_HTTP) private readonly http: HttpClient | null,
    private readonly audit: AuditService,
  ) {}

  private view(operator: MobileMoneyOperator, livemode: boolean, c: ProviderConnection | undefined) {
    return {
      operator,
      mode: livemode ? 'live' : 'test',
      environment: livemode ? 'production' : 'sandbox',
      status: c ? c.status : 'NOT_CONNECTED',
      lastVerifiedAt: c?.lastVerifiedAt ?? null,
      updatedAt: c?.updatedAt ?? null,
      fields: CREDENTIAL_FIELDS[operator],
      // URL à déclarer chez l'opérateur pour recevoir ses notifications.
      callbackUrl: c ? callbackUrl(operator, c.id) ?? null : null,
    };
  }

  async list(merchantId: string) {
    const rows = await this.prisma.providerConnection.findMany({ where: { merchantId, livemode: ANY_MODE } });
    return OPERATORS.flatMap((operator) =>
      [false, true].map((livemode) => this.view(operator, livemode, rows.find((r) => r.operator === operator && r.livemode === livemode))),
    );
  }

  private parseOperator(value: string): MobileMoneyOperator {
    const op = value?.toUpperCase();
    if (!OPERATORS.includes(op as MobileMoneyOperator)) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'operateur_inconnu', 'Opérateur inconnu', 'operator');
    }
    return op as MobileMoneyOperator;
  }

  /** Enregistre (ou remplace) les identifiants puis vérifie la connexion. */
  async save(merchantId: string, operatorParam: string, livemode: boolean, credentials: Record<string, unknown>, actor: Actor) {
    const operator = this.parseOperator(operatorParam);
    const clean: Record<string, string> = {};
    for (const { key } of CREDENTIAL_FIELDS[operator]) {
      const v = credentials?.[key];
      if (typeof v !== 'string' || v.trim().length === 0 || v.length > 500) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', `Champ requis : ${key}`, `credentials.${key}`);
      }
      clean[key] = v.trim();
    }

    const data = {
      environment: livemode ? 'production' : 'sandbox',
      credentialsEnc: encryptCredentials(clean),
      status: 'PENDING' as const,
      lastVerifiedAt: null,
    };
    const connection = await this.prisma.providerConnection.upsert({
      where: { merchantId_operator_livemode: { merchantId, operator, livemode } },
      create: { merchantId, operator, livemode, ...data },
      update: data,
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      merchantId,
      action: 'providers.connection_saved',
      targetType: 'provider_connection',
      targetId: connection.id,
      ip: actor.ip,
      metadata: { operator, livemode },
    });
    return this.verifyConnection(connection, actor);
  }

  async verify(merchantId: string, operatorParam: string, livemode: boolean, actor: Actor) {
    const operator = this.parseOperator(operatorParam);
    const connection = await this.prisma.providerConnection.findUnique({
      where: { merchantId_operator_livemode: { merchantId, operator, livemode } },
    });
    if (!connection || !connection.credentialsEnc || connection.status === 'DISABLED') {
      throw new ApiError(HttpStatus.NOT_FOUND, 'connexion_absente', 'Aucun compte connecté pour cet opérateur et ce mode');
    }
    return this.verifyConnection(connection, actor);
  }

  /** Vérification réelle auprès de l'opérateur (demande de jeton). */
  private async verifyConnection(connection: ProviderConnection, actor: Actor) {
    const operator = connection.operator as MobileMoneyOperator;
    let error: { code: string; message: string } | null = null;
    try {
      const provider = MOBILE_MONEY_FACTORIES[operator].create(
        { environment: connection.environment === 'production' ? 'production' : 'sandbox', credentials: decryptCredentials(connection.credentialsEnc!) },
        { tokenCache: this.tokenCache, http: this.http ?? undefined },
      );
      await provider.verifyCredentials();
    } catch (err) {
      error =
        err instanceof ProviderError && err.code === 'auth_failed'
          ? { code: 'identifiants_refuses', message: "L'opérateur refuse ces identifiants : vérifiez-les dans votre espace opérateur." }
          : { code: 'operateur_injoignable', message: "Vérification impossible pour l'instant : l'opérateur ne répond pas. Réessayez." };
    }
    const updated = await this.prisma.providerConnection.update({
      where: { id: connection.id },
      data: error ? { status: 'PENDING' } : { status: 'ACTIVE', lastVerifiedAt: new Date() },
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      merchantId: connection.merchantId,
      action: error ? 'providers.connection_verification_failed' : 'providers.connection_verified',
      targetType: 'provider_connection',
      targetId: connection.id,
      ip: actor.ip,
      metadata: { operator, livemode: connection.livemode, ...(error ? { reason: error.code } : {}) },
    });
    return { ...this.view(operator, updated.livemode, updated), ...(error ? { error } : {}) };
  }

  /** Déconnecte : identifiants effacés, la connexion ne sert plus aux paiements. */
  async disable(merchantId: string, operatorParam: string, livemode: boolean, actor: Actor) {
    const operator = this.parseOperator(operatorParam);
    const res = await this.prisma.providerConnection.updateMany({
      where: { merchantId, operator, livemode },
      data: { status: 'DISABLED', credentialsEnc: null, lastVerifiedAt: null },
    });
    if (res.count === 0) throw new ApiError(HttpStatus.NOT_FOUND, 'connexion_absente', 'Aucun compte connecté pour cet opérateur et ce mode');
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      merchantId,
      action: 'providers.connection_disabled',
      targetType: 'provider_connection',
      ip: actor.ip,
      metadata: { operator, livemode },
    });
    return { ok: true };
  }
}
