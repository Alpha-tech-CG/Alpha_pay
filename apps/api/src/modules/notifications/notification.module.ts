import { Global, Module } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { NotificationWebhookController } from "./notification-webhook.controller";
import { NotificationWebhookGuard } from "./notification-webhook.guard";
import { PushTokenController } from "./push-token.controller";
import { PushTokenService } from "./push-token.service";

@Global()
@Module({
  controllers: [NotificationWebhookController, PushTokenController],
  providers: [NotificationService, NotificationWebhookGuard, PushTokenService],
  exports: [NotificationService, PushTokenService],
})
export class NotificationModule {}
