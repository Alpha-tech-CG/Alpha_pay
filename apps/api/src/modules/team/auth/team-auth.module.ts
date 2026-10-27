import { Module } from '@nestjs/common';
import { RequireMemberGuard } from './require-member.guard';
import { RequireActionGuard } from './require-action.guard';

/**
 * Gardes de l'équipe marchand, à enchaîner sur chaque route :
 *   @UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard)
 * SessionGuard est fourni par AuthModule (global).
 */
@Module({
  providers: [RequireMemberGuard, RequireActionGuard],
  exports: [RequireMemberGuard, RequireActionGuard],
})
export class TeamAuthModule {}
