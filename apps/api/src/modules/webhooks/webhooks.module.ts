import { Module } from '@nestjs/common';
import { VerifModule } from '../verif/verif.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksGateway } from './webhooks.gateway';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [WebhooksOutModule, MetricsModule, PaymentsModule, VerifModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksGateway],
  exports: [WebhooksGateway, WebhooksService],
})
export class WebhooksModule {}
