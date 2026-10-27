import { Module } from '@nestjs/common';
import { PaylinksController } from './paylinks.controller';
import { PaylinksService } from './paylinks.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [PaylinksController],
  providers: [PaylinksService],
})
export class PaylinksModule {}
