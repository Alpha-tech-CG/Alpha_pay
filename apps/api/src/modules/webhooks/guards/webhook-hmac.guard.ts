import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { Operator } from '@paybrain/shared';
import { verifyWebhookHmac } from '../../../common/security/hmac';

/**
 * Garde HMAC SHA-256 pour les webhooks entrants opérateur (ALP-158).
 *
 * Exige `req.rawBody` (NestFactory.create(AppModule, { rawBody: true })).
 * Tout échec → 401 à CORPS VIDE, JAMAIS 200 (ALP-159) : un attaquant ne doit
 * jamais pouvoir faire passer une transaction PENDING en SUCCESSFUL via un POST
 * forgé, ni obtenir le moindre détail discriminant dans la réponse.
 */
@Injectable()
export class WebhookHmacGuard implements CanActivate {
  private readonly logger = new Logger(WebhookHmacGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    const operator: Operator = request.params?.operator?.toUpperCase() === 'AIRTEL' ? 'AIRTEL' : 'MTN';

    const secret =
      operator === 'AIRTEL' ? process.env.AIRTEL_WEBHOOK_SECRET : process.env.MTN_WEBHOOK_SECRET;

    if (!secret) {
      // Pas de secret configuré = on refuse plutôt que d'accepter aveuglément.
      this.logger.error(`Secret webhook ${operator} non configuré — rejet`);
      return this.deny(response);
    }

    const rawBody: Buffer | undefined = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      this.logger.error('rawBody indisponible — rawBody:true manquant au bootstrap ?');
      return this.deny(response);
    }

    const result = verifyWebhookHmac({
      secret,
      signatureHeader: request.headers['x-signature-256'],
      timestampHeader: request.headers['x-timestamp'],
      rawBody,
    });

    if (!result.ok) {
      this.logger.warn(`Webhook ${operator} rejeté : ${result.reason}`);
      return this.deny(response);
    }

    request.webhookTimestamp = result.timestamp;
    return true;
  }

  /** 401 à corps vide. Renvoie false pour court-circuiter le pipeline NestJS. */
  private deny(response: Response): boolean {
    response.status(401).end();
    return false;
  }
}
