import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { CardWebhooksController, MockCardController } from './card-acquirer.controller';
import { CardEventsService } from './card-events.service';
import { DisputesController, MerchantDisputesController } from './disputes.controller';
import { TeamAuthModule } from '../team/auth/team-auth.module';

/** Carte bancaire (§M13) : webhooks de l'acquéreur, litiges, page de l'acquéreur factice. */
@Module({
  imports: [PaymentsModule, WebhooksModule, WebhooksOutModule, TeamAuthModule],
  controllers: [CardWebhooksController, MockCardController, DisputesController, MerchantDisputesController],
  providers: [CardEventsService],
  exports: [CardEventsService],
})
export class CardAcquirerModule {}
