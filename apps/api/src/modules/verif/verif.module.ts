import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { StoresModule } from '../stores/stores.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { VerifBus } from './verif-bus';
import { VerifController, VerifStreamController } from './verif.controller';
import { VerifService, WEB_PUSH, webPushProviderFromEnv } from './verif.service';

/** T-55 — Vérif : confirmation instantanée des paiements au vendeur et au caissier. */
@Module({
  imports: [MessagingModule, StoresModule, TeamAuthModule],
  controllers: [VerifController, VerifStreamController],
  providers: [VerifBus, VerifService, { provide: WEB_PUSH, useFactory: webPushProviderFromEnv }],
  exports: [VerifService, WEB_PUSH],
})
export class VerifModule {}
