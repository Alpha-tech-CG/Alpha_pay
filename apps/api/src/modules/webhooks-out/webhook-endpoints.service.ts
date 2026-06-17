import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Injectable()
export class WebhookEndpointsService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  list(merchantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, status: true, secret: true, createdAt: true },
    });
  }

  create(merchantId: string, dto: CreateWebhookEndpointDto) {
    return this.prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url: dto.url,
        events: dto.events ?? [],
        // Secret de signature propre à l'endpoint (le marchand le voit pour vérifier).
        secret: `whsec_${randomBytes(24).toString('base64url')}`,
        status: 'ACTIVE',
      },
      select: { id: true, url: true, events: true, status: true, secret: true, createdAt: true },
    });
  }

  async update(merchantId: string, id: string, dto: Partial<CreateWebhookEndpointDto> & { status?: 'ACTIVE' | 'DISABLED' }) {
    await this.assertOwned(merchantId, id);
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

  async remove(merchantId: string, id: string) {
    await this.assertOwned(merchantId, id);
    await this.prisma.webhookDelivery.deleteMany({ where: { endpointId: id } });
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { id, deleted: true };
  }

  async deliveries(merchantId: string, id: string) {
    await this.assertOwned(merchantId, id);
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

  async test(merchantId: string, id: string) {
    const endpoint = await this.assertOwned(merchantId, id);
    return this.delivery.sendTest({ id: endpoint.id, url: endpoint.url, secret: endpoint.secret });
  }

  private async assertOwned(merchantId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!endpoint) throw new NotFoundException('Endpoint introuvable');
    if (endpoint.merchantId !== merchantId) throw new ForbiddenException();
    return endpoint;
  }
}
