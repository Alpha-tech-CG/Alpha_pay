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
  UseInterceptors,
  UploadedFile,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiError } from '../../../common/errors/api-error';
import { ApiConsumes, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../../auth/session.guard';
import { RequireMemberGuard } from '../../team/auth/require-member.guard';
import { can } from '../../team/permissions/permissions';
import { MerchantReconciliationService } from './merchant-reconciliation.service';
import { PatchReconciliationDayDto } from './patch-reconciliation-day.dto';

function assertDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', 'date : AAAA-MM-JJ', 'date');
  }
}

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

  @Get(':date/tills')
  @ApiOperation({ summary: 'Vue journalière par caisse : MTN, Airtel, cash déclaré, statut (date AAAA-MM-JJ)' })
  async dayByTills(@Param('merchantId') _id: string, @Param('date') date: string, @Req() req: any, @Query('mode') mode?: string) {
    const { merchantId, role } = req.membership;
    if (!can(role, 'reconciliation:view')) throw new ForbiddenException('Accès refusé');
    assertDate(date);
    return this.svc.dayByTills(merchantId, date, mode === 'live', 'all');
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
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Importer un relevé opérateur (CSV, champ « file ») et comparer ligne à ligne" })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  async importCsv(
    @Param('merchantId') _id: string,
    @Param('date') date: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('till_id') tillId?: string,
  ) {
    const { merchantId, role } = req.membership;
    if (!can(role, 'reconciliation:write')) throw new ForbiddenException('Accès refusé');
    if (!file?.buffer?.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'fichier_manquant', 'Joignez le relevé CSV (champ « file »)', 'file');
    return this.svc.importCsv(merchantId, date, mode === 'live', file.buffer.toString('utf8'), tillId);
  }
}
