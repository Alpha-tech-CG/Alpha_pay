import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { StoresModule } from '../stores/stores.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { MerchantPaymentsController } from './merchant-payments.controller';
import { RefundsService } from './refunds.service';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';

@Module({
  imports: [StoresModule, TeamAuthModule, WebhooksOutModule],
  controllers: [PaymentsController, MerchantPaymentsController],
  providers: [PaymentsService, RefundsService, IdempotencyInterceptor],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
