import { Module } from '@nestjs/common';
import { WebhooksOutController } from './webhooks-out.controller';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';

@Module({
  controllers: [WebhooksOutController],
  providers: [WebhookEndpointsService, WebhookDeliveryService, WebhookDeliveryWorker],
  exports: [WebhookDeliveryService],
})
export class WebhooksOutModule {}
