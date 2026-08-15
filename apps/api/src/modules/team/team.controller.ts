import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ClerkSessionGuard } from './auth/clerk-session.guard';
import { RequireMemberGuard } from './auth/require-member.guard';
import { RequireActionGuard } from './auth/require-action.guard';
import { RequireAction } from './auth/require-action.decorator';
import { actorFromRequest } from './auth/actor';
import { MembersService } from './services/members.service';
import { MemberEventsService } from './services/member-events.service';
import { ChangeRoleDto } from './dto/change-role.dto';

/**
 * Gestion de l'équipe marchand (dashboard web, décision 2A). `:merchantId`
 * fait foi via `req.membership` (RequireMemberGuard) — jamais le body/query.
 */
@ApiTags('Équipe marchand')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/members')
@UseGuards(ClerkSessionGuard, RequireMemberGuard, RequireActionGuard)
export class TeamController {
  constructor(
    private readonly members: MembersService,
    private readonly events: MemberEventsService,
  ) {}

  @Get()
  @RequireAction('team:view')
  list(@Param('merchantId') merchantId: string, @Req() req: any) {
    return this.members.list(merchantId, req.membership.role);
  }

  @Get('events')
  @RequireAction('team:audit')
  listEvents(@Param('merchantId') merchantId: string) {
    return this.events.list(merchantId);
  }

  @Patch(':memberId')
  @RequireAction('team:change_role')
  changeRole(
    @Param('merchantId') merchantId: string,
    @Param('memberId') memberId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: any,
  ) {
    return this.members.changeRole(merchantId, memberId, dto.role, actorFromRequest(req));
  }

  @Post(':memberId/suspend')
  @RequireAction('team:suspend')
  suspend(@Param('merchantId') merchantId: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.members.suspend(merchantId, memberId, actorFromRequest(req));
  }

  @Post(':memberId/reactivate')
  @RequireAction('team:suspend')
  reactivate(@Param('merchantId') merchantId: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.members.reactivate(merchantId, memberId, actorFromRequest(req));
  }

  @Delete(':memberId')
  @RequireAction('team:remove')
  remove(@Param('merchantId') merchantId: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.members.remove(merchantId, memberId, actorFromRequest(req));
  }
}
