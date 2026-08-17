import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycAdminController } from './kyc-admin.controller';
import { KycService } from './kyc.service';
import { KycProviderService } from './kyc.providers';
import { KycDocumentStorageService } from './kyc-document-storage.service';
import { KycWebhookController } from './kyc-webhook.controller';
import { SmileWebhookGuard } from './kyc-webhook.guard';
import { KycCron } from './kyc.cron';

@Module({
  controllers: [KycController, KycAdminController, KycWebhookController],
  providers: [KycService, KycProviderService, KycDocumentStorageService, SmileWebhookGuard, KycCron],
  exports: [KycDocumentStorageService],
})
export class KycModule {}
