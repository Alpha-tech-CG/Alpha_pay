import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksGateway } from './webhooks.gateway';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [WebhooksOutModule, MetricsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksGateway],
  exports: [WebhooksGateway],
})
export class WebhooksModule {}
