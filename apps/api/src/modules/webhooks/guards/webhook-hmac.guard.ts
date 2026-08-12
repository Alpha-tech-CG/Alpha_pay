import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { Operator } from '@paybrain/shared';
import { verifyWebhookHmac } from '../../../common/security/hmac';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class WebhookHmacGuard implements CanActivate {
  private readonly logger = new Logger(WebhookHmacGuard.name);

  constructor(private readonly metrics?: MetricsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    const operator: Operator = request.params?.operator?.toUpperCase() === 'AIRTEL' ? 'AIRTEL' : 'MTN';

    const secret =
      operator === 'AIRTEL' ? process.env.AIRTEL_WEBHOOK_SECRET : process.env.MTN_WEBHOOK_SECRET;

    if (!secret) {
      this.logger.error(`Webhook ${operator} rejected: secret is not configured`);
      this.record(operator, 'missing_secret');
      return this.deny(response);
    }

    const rawBody: Buffer | undefined = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      this.logger.error('Webhook rejected: rawBody is unavailable');
      this.record(operator, 'missing_raw_body');
      return this.deny(response);
    }

    const result = verifyWebhookHmac({
      secret,
      signatureHeader: request.headers['x-signature-256'],
      timestampHeader: request.headers['x-timestamp'],
      rawBody,
    });

    if (!result.ok) {
      this.logger.warn(`Webhook ${operator} rejected: ${result.reason}`);
      this.record(operator, result.reason);
      return this.deny(response);
    }

    this.record(operator, 'valid');
    request.webhookTimestamp = result.timestamp;
    return true;
  }

  private record(operator: Operator, result: string) {
    this.metrics?.webhooksTotal.inc({ operator, result });
  }

  private deny(response: Response): boolean {
    response.status(401).end();
    return false;
  }
}
