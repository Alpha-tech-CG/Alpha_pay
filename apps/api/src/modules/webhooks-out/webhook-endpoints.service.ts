import { ForbiddenException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error';
import { assertDeliverableWebhookUrl, WebhookUrlRejectedError } from '../../common/security/webhook-url-guard';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { WebhookDeliveryService } from './webhook-delivery.service';

/**
 * URL publique exigée, en live comme en test (anti-SSRF, cf. webhook-url-guard) :
 * https en live, nom résolu vers des adresses publiques uniquement. La même
 * vérification est refaite à chaque envoi, sur l'adresse effectivement connectée.
 */
async function assertDeliverableUrl(url: string, livemode: boolean): Promise<void> {
  try {
    await assertDeliverableWebhookUrl(url, { livemode });
  } catch (err) {
    if (err instanceof WebhookUrlRejectedError) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'url_webhook_invalide', `URL de webhook refusée : ${err.message}`, 'url');
    }
    throw err;
  }
}

@Injectable()
export class WebhookEndpointsService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  list(merchantId: string, livemode: boolean) {
    return this.prisma.webhookEndpoint.findMany({
      where: { merchantId, livemode },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, status: true, secret: true, createdAt: true },
    });
  }

  async create(merchantId: string, livemode: boolean, dto: CreateWebhookEndpointDto) {
    await assertDeliverableUrl(dto.url, livemode);
    return this.prisma.webhookEndpoint.create({
      data: {
        merchantId,
        livemode,
        url: dto.url,
        events: dto.events ?? [],
        // Secret de signature propre à l'endpoint (le marchand le voit pour vérifier).
        secret: `whsec_${randomBytes(24).toString('base64url')}`,
        status: 'ACTIVE',
      },
      select: { id: true, url: true, events: true, status: true, secret: true, createdAt: true },
    });
  }

  async update(merchantId: string, livemode: boolean, id: string, dto: Partial<CreateWebhookEndpointDto> & { status?: 'ACTIVE' | 'DISABLED' }) {
    await this.assertOwned(merchantId, livemode, id);
    if (dto.url) await assertDeliverableUrl(dto.url, livemode);
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: dto.url,
        events: dto.events,
        status: dto.status,
      },
      select: { id: true, url: true, events: true, status: true, secret: true, createdAt: true },
    });
  }

  async remove(merchantId: string, livemode: boolean, id: string) {
    await this.assertOwned(merchantId, livemode, id);
    await this.prisma.webhookDelivery.deleteMany({ where: { endpointId: id } });
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { id, deleted: true };
  }

  async deliveries(merchantId: string, livemode: boolean, id: string) {
    await this.assertOwned(merchantId, livemode, id);
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, event: true, webhookId: true, status: true, attempts: true,
        responseStatus: true, lastError: true, nextRetryAt: true, createdAt: true,
      },
    });
  }

  /** Renvoi manuel d'une livraison (§M10, bouton « renvoyer ») : même événement, même identifiant. */
  async resend(merchantId: string, livemode: boolean, endpointId: string, deliveryId: string) {
    await this.assertOwned(merchantId, livemode, endpointId);
    const delivery = await this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, endpointId } });
    if (!delivery) throw new NotFoundException('Livraison introuvable');
    return this.delivery.resend(delivery);
  }

  async test(merchantId: string, livemode: boolean, id: string) {
    const endpoint = await this.assertOwned(merchantId, livemode, id);
    return this.delivery.sendTest({ id: endpoint.id, url: endpoint.url, secret: endpoint.secret });
  }

  private async assertOwned(merchantId: string, livemode: boolean, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    // Une clé test ne voit pas les endpoints live, et inversement (§4.6).
    if (!endpoint || endpoint.livemode !== livemode) throw new NotFoundException('Endpoint introuvable');
    if (endpoint.merchantId !== merchantId) throw new ForbiddenException();
    return endpoint;
  }
}
