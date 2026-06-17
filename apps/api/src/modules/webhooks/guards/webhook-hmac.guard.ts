import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Operator } from '@paybrain/shared';
import { verifyWebhookHmac } from '../../../common/security/hmac';

/**
 * Garde HMAC SHA-256 pour les webhooks entrants opérateur (ALP-158).
 *
 * Exige `req.rawBody` (NestFactory.create(AppModule, { rawBody: true })).
 * Tout échec → 401, JAMAIS 200 : un attaquant ne doit jamais pouvoir faire
 * passer une transaction PENDING en SUCCESSFUL via un POST forgé.
 */
@Injectable()
export class WebhookHmacGuard implements CanActivate {
  private readonly logger = new Logger(WebhookHmacGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const operator: Operator = request.params?.operator?.toUpperCase() === 'AIRTEL' ? 'AIRTEL' : 'MTN';

    const secret =
      operator === 'AIRTEL' ? process.env.AIRTEL_WEBHOOK_SECRET : process.env.MTN_WEBHOOK_SECRET;

    if (!secret) {
      // Pas de secret configuré = on refuse plutôt que d'accepter aveuglément.
      this.logger.error(`Secret webhook ${operator} non configuré — rejet`);
      throw new UnauthorizedException();
    }

    const rawBody: Buffer | undefined = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      this.logger.error('rawBody indisponible — rawBody:true manquant au bootstrap ?');
      throw new UnauthorizedException();
    }

    const result = verifyWebhookHmac({
      secret,
      signatureHeader: request.headers['x-signature-256'],
      timestampHeader: request.headers['x-timestamp'],
      rawBody,
    });

    if (!result.ok) {
      this.logger.warn(`Webhook ${operator} rejeté : ${result.reason}`);
      throw new UnauthorizedException();
    }

    request.webhookTimestamp = result.timestamp;
    return true;
  }
}
