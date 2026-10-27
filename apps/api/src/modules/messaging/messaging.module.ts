import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { DevOutboxController } from './dev-outbox.controller';
import { MessagingProviders } from './messaging-providers';
import { MessagingWebhooksController } from './messaging-webhooks.controller';
import { MessagingApiController } from './messaging-api.controller';
import { OtpService } from './otp.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { MessagingService } from './messaging.service';
import { TemplateService } from './template.service';

/** M9 — Messages et OTP : modèles, envoi, bascule, livraison, désabonnement, crédits, API revendue. */
@Module({
  controllers: [MessagingApiController, MessagingWebhooksController, DevOutboxController],
  providers: [MessagingProviders, TemplateService, CreditsService, MessagingService, OtpService, IdempotencyInterceptor],
  exports: [MessagingService, CreditsService, TemplateService, OtpService],
})
export class MessagingModule {}
