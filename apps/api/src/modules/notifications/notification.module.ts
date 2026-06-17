import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

// Global : le service de notification est injectable partout (réconciliation,
// échec webhook, onboarding…).
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
