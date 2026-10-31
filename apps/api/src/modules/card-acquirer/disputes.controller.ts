import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { SessionGuard } from '../auth/session.guard';
import { DisputeEvidenceDto } from '../payments/dto/create-payment.dto';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { can } from '../team/permissions/permissions';
import { CardEventsService, presentDispute } from './card-events.service';

/** Litiges carte par l'API (§M13) : le mode test/live est porté par la clé. */
@ApiTags('Litiges carte')
@ApiSecurity('ApiKey')
@Controller('v1/disputes')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class DisputesController {
  constructor(private readonly events: CardEventsService) {}

  @Get()
  @RequiredScopes('payments:read')
  @ApiOperation({ summary: 'Lister les litiges carte' })
  async list(@Req() req: any) {
    return { object: 'list', data: (await this.events.listDisputes(req.merchant.id, req.livemode === true)).map(presentDispute) };
  }

  @Post(':id/evidence')
  @HttpCode(200)
  @RequiredScopes('payments:write')
  @ApiOperation({ summary: 'Répondre à un litige : envoyer les preuves à l’acquéreur' })
  async evidence(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DisputeEvidenceDto, @Req() req: any) {
    return presentDispute(await this.events.submitEvidence(id, req.merchant.id, req.livemode === true, dto.evidence, { type: 'api_key', id: req.apiKeyId, ip: req.ip }));
  }
}

/** Litiges vus et traités depuis le tableau de bord (propriétaire, administrateur). */
@ApiTags('Litiges carte (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/disputes')
@UseGuards(SessionGuard, RequireMemberGuard)
export class MerchantDisputesController {
  constructor(private readonly events: CardEventsService) {}

  @Get()
  async list(@Req() req: any, @Query('mode') mode?: string) {
    if (!can(req.membership.role, 'payments:view')) throw new ForbiddenException();
    return { data: (await this.events.listDisputes(req.membership.merchantId, mode === 'live')).map(presentDispute) };
  }

  @Post(':id/evidence')
  @HttpCode(200)
  async evidence(@Param('id', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Body() dto: DisputeEvidenceDto, @Req() req: any) {
    if (!can(req.membership.role, 'disputes:manage')) throw new ForbiddenException('Réservé au propriétaire et aux administrateurs');
    return presentDispute(await this.events.submitEvidence(id, req.membership.merchantId, mode === 'live', dto.evidence, { type: 'user', id: req.appUser.id, ip: req.ip }));
  }
}
