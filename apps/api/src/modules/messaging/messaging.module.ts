import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { DevOutboxController } from './dev-outbox.controller';
import { MessagingProviders } from './messaging-providers';
import { MessagingWebhooksController } from './messaging-webhooks.controller';
import { MessagingService } from './messaging.service';
import { TemplateService } from './template.service';

/** M9 — Messages : modèles, envoi, bascule, livraison, désabonnement, crédits. */
@Module({
  controllers: [MessagingWebhooksController, DevOutboxController],
  providers: [MessagingProviders, TemplateService, CreditsService, MessagingService],
  exports: [MessagingService, CreditsService, TemplateService],
})
export class MessagingModule {}
