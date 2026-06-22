import { Module } from '@nestjs/common';
import { UssdController } from './ussd.controller';
import { UssdService } from './ussd.service';
import { UssdGatewayGuard } from './ussd-gateway.guard';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [UssdController],
  providers: [UssdService, UssdGatewayGuard],
})
export class UssdModule {}
