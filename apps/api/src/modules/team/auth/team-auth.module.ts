import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { ClerkSessionGuard } from './clerk-session.guard';
import { RequireMemberGuard } from './require-member.guard';
import { RequireActionGuard } from './require-action.guard';

/**
 * Guards d'auth team (étape A du handoff), à consommer par `TeamModule`
 * (étape C, controllers) via :
 *   @UseGuards(ClerkSessionGuard, RequireMemberGuard, RequireActionGuard)
 * Pas encore importé dans AppModule : aucun controller ne les utilise avant
 * l'étape C (`docs/TEAM_MEMBERS_HANDOFF.md`).
 */
@Module({
  imports: [UsersModule],
  providers: [ClerkSessionGuard, RequireMemberGuard, RequireActionGuard],
  exports: [ClerkSessionGuard, RequireMemberGuard, RequireActionGuard],
})
export class TeamAuthModule {}
