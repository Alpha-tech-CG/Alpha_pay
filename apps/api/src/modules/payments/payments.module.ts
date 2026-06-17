import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, IdempotencyInterceptor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
