import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { MerchantPaymentLinksController, PaymentLinksController, PublicPaymentLinksController } from './payment-links.controller';
import { PaymentLinksService } from './payment-links.service';

/** T-52 — Liens de paiement (API, tableau de bord, page hébergée). */
@Module({
  imports: [PaymentsModule, MessagingModule, TeamAuthModule],
  controllers: [PaymentLinksController, MerchantPaymentLinksController, PublicPaymentLinksController],
  providers: [PaymentLinksService],
  exports: [PaymentLinksService],
})
export class PaymentLinksModule {}
