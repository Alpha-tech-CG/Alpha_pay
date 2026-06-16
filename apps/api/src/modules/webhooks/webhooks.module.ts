import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksGateway } from './webhooks.gateway';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksGateway],
  exports: [WebhooksGateway],
})
export class WebhooksModule {}
