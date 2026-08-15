import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ClerkSessionGuard } from './auth/clerk-session.guard';
import { RequireMemberGuard } from './auth/require-member.guard';
import { RequireActionGuard } from './auth/require-action.guard';
import { RequireAction } from './auth/require-action.decorator';
import { actorFromRequest } from './auth/actor';
import { InvitationsService } from './services/invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

/**
 * Gate MANAGER minimum au niveau route (`team:invite`). Le contrôle plus fin
 * (inviter un ADMIN nécessite `team:invite_admin`) est appliqué DANS
 * `InvitationsService.create` selon le rôle demandé — défense en profondeur.
 */
@ApiTags('Équipe marchand — invitations')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/members/invitations')
@UseGuards(ClerkSessionGuard, RequireMemberGuard, RequireActionGuard)
@RequireAction('team:invite')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  create(@Param('merchantId') merchantId: string, @Body() dto: CreateInvitationDto, @Req() req: any) {
    return this.invitations.create(merchantId, dto, actorFromRequest(req));
  }

  @Get()
  list(@Param('merchantId') merchantId: string) {
    return this.invitations.list(merchantId);
  }

  @Delete(':invitationId')
  revoke(
    @Param('merchantId') merchantId: string,
    @Param('invitationId') invitationId: string,
    @Req() req: any,
  ) {
    return this.invitations.revoke(merchantId, invitationId, actorFromRequest(req));
  }
}
