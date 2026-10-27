import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ANY_MODE, PrismaClient } from '@paybrain/database';
import { isValidCallbackToken } from '../providers/callback-token';
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
  constructor(
    private readonly webhooksService: WebhooksService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

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

  /**
   * Callback opérateur par URL secrète propre à la connexion du marchand
   * (D-041) : MTN et Airtel ne signent pas leurs callbacks. Allowlist IP en
   * défense en profondeur ; le statut est toujours revérifié auprès de
   * l'opérateur avant tout changement.
   */
  @Post('operators/:operator/:connectionId/:token')
  @HttpCode(200)
  @UseGuards(WebhookIpAllowlistGuard)
  async handleConnectionCallback(
    @Param('operator') operator: string,
    @Param('connectionId') connectionId: string,
    @Param('token') token: string,
    @Body() payload: WebhookPayload,
  ) {
    if (!isValidCallbackToken(connectionId, token)) throw new ForbiddenException();
    const connection = await this.prisma.providerConnection.findFirst({
      where: { id: connectionId, livemode: ANY_MODE },
      select: { merchantId: true, operator: true },
    });
    if (!connection || connection.operator !== operator.toUpperCase()) throw new ForbiddenException();
    return this.webhooksService.handleWebhook(connection.operator as 'MTN' | 'AIRTEL', payload, undefined, connection.merchantId);
  }
}
