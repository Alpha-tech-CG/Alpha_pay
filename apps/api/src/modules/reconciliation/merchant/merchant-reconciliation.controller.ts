import { ModuleAccessGuard, RequireModule } from '../../billing/module-access.guard';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../../auth/session.guard';
import { RequireMemberGuard } from '../../team/auth/require-member.guard';
import { can } from '../../team/permissions/permissions';
import { MerchantReconciliationService } from './merchant-reconciliation.service';
import { PatchReconciliationDayDto } from './patch-reconciliation-day.dto';

/**
 * Rapprochement journalier marchand (§M6, T-72). Accessible aux rôles
 * reconciliation:view (lecture) et reconciliation:write (mise à jour).
 */
@ApiTags('Rapprochement (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/reconciliation')
@UseGuards(SessionGuard, RequireMemberGuard, ModuleAccessGuard)
@RequireModule('m6_manage')
export class MerchantReconciliationController {
  constructor(private readonly svc: MerchantReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les journées de rapprochement (filtre : dates, caisse)' })
  list(
    @Param('merchantId') _id: string,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('till_id') tillId?: string,
  ) {
    const { merchantId, role } = req.membership;
    if (!can(role, 'reconciliation:view')) throw new ForbiddenException('Accès refusé');
    return this.svc.listDays(merchantId, mode === 'live', { from, to, tillId });
  }

  @Get(':date')
  @ApiOperation({ summary: 'Lire (et recalculer) un jour — format date : YYYY-MM-DD' })
  getDay(
    @Param('merchantId') _id: string,
    @Param('date') date: string,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('till_id') tillId?: string,
  ) {
    const { merchantId, role } = req.membership;
    if (!can(role, 'reconciliation:view')) throw new ForbiddenException('Accès refusé');
    return this.svc.getOrComputeDay(merchantId, date, mode === 'live', tillId);
  }

  @Patch(':date')
  @ApiOperation({ summary: 'Mettre à jour le statut ou le commentaire d\'un jour' })
  patchDay(
    @Param('merchantId') _id: string,
    @Param('date') date: string,
    @Body() dto: PatchReconciliationDayDto,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('till_id') tillId?: string,
  ) {
    const { merchantId, memberId, role } = req.membership;
    if (!can(role, 'reconciliation:write')) throw new ForbiddenException('Accès refusé');
    return this.svc.updateDay(merchantId, date, mode === 'live', dto, memberId, tillId);
  }

  @Post(':date/import-csv')
  @HttpCode(200)
  @ApiConsumes('text/plain', 'text/csv')
  @ApiOperation({ summary: 'Importer un relevé CSV et déclencher la détection automatique d\'écart' })
  async importCsv(
    @Param('merchantId') _id: string,
    @Param('date') date: string,
    @Body() body: string,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('till_id') tillId?: string,
  ) {
    const { merchantId, role } = req.membership;
    if (!can(role, 'reconciliation:write')) throw new ForbiddenException('Accès refusé');
    return this.svc.importCsv(merchantId, date, mode === 'live', typeof body === 'string' ? body : JSON.stringify(body), tillId);
  }
}
