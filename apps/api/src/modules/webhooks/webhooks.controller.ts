import { BadRequestException, Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookPayload } from '@paybrain/shared';
import { WebhookHmacGuard } from './guards/webhook-hmac.guard';
import { WebhookIpAllowlistGuard } from './guards/webhook-ip-allowlist.guard';

/**
 * Webhooks entrants opérateur. Sécurisés par HMAC SHA-256 (ALP-158) :
 * la signature `X-Signature-256` sur `${X-Timestamp}.${rawBody}` est vérifiée
 * en amont par WebhookHmacGuard. Toute requête non signée correctement → 401.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':operator')
  @HttpCode(200)
  @UseGuards(WebhookIpAllowlistGuard, WebhookHmacGuard)
  async handle(@Param('operator') operator: string, @Body() payload: WebhookPayload) {
    const normalized = operator.toUpperCase();
    if (normalized !== 'MTN' && normalized !== 'AIRTEL') {
      throw new BadRequestException('Opérateur inconnu');
    }
    return this.webhooksService.handleWebhook(normalized, payload);
  }
}
