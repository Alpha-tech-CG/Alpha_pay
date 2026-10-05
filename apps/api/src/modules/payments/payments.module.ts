import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { RoutingModule } from '../routing/routing.module';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [RoutingModule, FeesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, IdempotencyInterceptor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
