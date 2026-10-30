import { Global, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentLinksModule } from '../payment-links/payment-links.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ModuleAccessGuard } from './module-access.guard';

/** M11 — Facturation AlphaPay ; global : le garde des modules payants sert à tous les modules. */
@Global()
@Module({
  imports: [TeamAuthModule, PaymentLinksModule, MessagingModule],
  controllers: [BillingController],
  providers: [BillingService, ModuleAccessGuard],
  exports: [BillingService, ModuleAccessGuard],
})
export class BillingModule {}
