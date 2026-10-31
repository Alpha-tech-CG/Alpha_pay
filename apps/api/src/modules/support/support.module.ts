import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { OpsAlertsService } from './ops-alerts.service';
import { MessagingModule } from '../messaging/messaging.module';

/** Assistance client et service développeur du back-office (§M12). */
@Module({
  imports: [StaffModule, PaymentsModule, WebhooksModule, WebhooksOutModule, ApiKeysModule, MessagingModule],
  controllers: [SupportController],
  providers: [SupportService, OpsAlertsService],
})
export class SupportModule {}
