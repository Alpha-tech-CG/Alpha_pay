import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { StoresModule } from '../stores/stores.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { MerchantPaymentsController } from './merchant-payments.controller';

@Module({
  imports: [StoresModule, TeamAuthModule],
  controllers: [PaymentsController, MerchantPaymentsController],
  providers: [PaymentsService, IdempotencyInterceptor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
