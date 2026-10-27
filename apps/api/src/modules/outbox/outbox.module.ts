import { Module } from '@nestjs/common';
import { OutboxController } from './outbox.controller';
import { OutboxService } from './outbox.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [OutboxController],
  providers: [OutboxService],
})
export class OutboxModule {}
