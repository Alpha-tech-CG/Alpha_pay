import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentLinksModule } from '../payment-links/payment-links.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { CustomersService } from './customers.service';
import { InvoicesService } from './invoices.service';
import { InvoicingController } from './invoicing.controller';
import { PublicDocumentsController, PublicInvoicingController } from './public-invoicing.controller';
import { RecoveryService } from './recovery.service';
import { RemindersService } from './reminders.service';

/** M7 — Recouvrer : clients, factures, échéanciers, relances, reçus. */
@Module({
  imports: [TeamAuthModule, PaymentLinksModule, MessagingModule, WebhooksOutModule],
  controllers: [InvoicingController, PublicInvoicingController, PublicDocumentsController],
  providers: [CustomersService, InvoicesService, RemindersService, RecoveryService],
  exports: [CustomersService, InvoicesService, RemindersService, RecoveryService],
})
export class InvoicingModule {}
