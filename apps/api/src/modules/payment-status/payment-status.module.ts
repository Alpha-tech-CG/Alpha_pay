import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { PaymentStatusPoller } from './payment-status.poller';

@Module({
  imports: [PaymentsModule, WebhooksModule],
  providers: [PaymentStatusPoller],
  exports: [PaymentStatusPoller],
})
export class PaymentStatusModule {}
