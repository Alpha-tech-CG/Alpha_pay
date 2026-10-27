import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { CheckoutApiController, CheckoutPageController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

/** T-53 — Page de paiement hébergée (caisses et liens). */
@Module({
  imports: [PaymentsModule],
  controllers: [CheckoutApiController, CheckoutPageController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
