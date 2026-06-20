import { Global, Module } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { NotificationWebhookController } from "./notification-webhook.controller";
import { NotificationWebhookGuard } from "./notification-webhook.guard";

// Global : le service de notification est injectable partout (réconciliation,
// échec webhook, onboarding…).
@Global()
@Module({
  controllers: [NotificationWebhookController],
  providers: [NotificationService, NotificationWebhookGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
