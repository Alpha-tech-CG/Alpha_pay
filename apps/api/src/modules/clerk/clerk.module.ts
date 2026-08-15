import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';
import { NotificationModule } from '../notifications/notification.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [NotificationModule, UsersModule],
  controllers: [ClerkWebhookController],
  providers: [ClerkWebhookService],
})
export class ClerkModule {}
