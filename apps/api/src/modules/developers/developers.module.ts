import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { ApiLogsPurge, DevelopersController } from './developers.controller';

/** M10 — Espace Développeurs du tableau de bord (clés, journal des requêtes, webhooks). */
@Module({
  imports: [ApiKeysModule, WebhooksOutModule, TeamAuthModule],
  controllers: [DevelopersController],
  providers: [ApiLogsPurge],
})
export class DevelopersModule {}
