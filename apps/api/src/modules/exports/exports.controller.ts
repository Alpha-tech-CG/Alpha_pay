import { ModuleAccessGuard, RequireModule } from '../billing/module-access.guard';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ExportFormat } from '@paybrain/database';
import { SessionGuard } from '../auth/session.guard';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { ExportFilters, ExportKind, ExportsService } from './exports.service';

class CreateExportDto {
  @IsOptional() @IsIn(['transactions', 'reconciliation']) kind?: ExportKind;
  @IsOptional() @IsIn(['CSV', 'XLSX']) format?: 'CSV' | 'XLSX';
  @IsOptional() @IsDateString() date_from?: string;
  @IsOptional() @IsDateString() date_to?: string;
  @IsOptional() @IsIn(['en_attente', 'réussi', 'échoué', 'expiré', 'annulé']) status?: string;
  @IsOptional() @IsIn(['mtn', 'airtel', 'card']) operator?: string;
  @IsOptional() @IsUUID() till_id?: string;
}

/** Exports CSV et Excel en tâche de fond (§M6, T-73) : propriétaire, administrateur, comptable. */
@ApiTags('Exports (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/exports')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard, ModuleAccessGuard)
@RequireModule('m6_manage')
@RequireAction('exports:create')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  @ApiOperation({ summary: "Lancer un export (mode=test|live) ; le fichier est produit par le worker" })
  async create(
    @Param('merchantId') _merchantId: string,
    @Query('mode') mode: string | undefined,
    @Req() req: any,
    @Body() body: CreateExportDto,
  ) {
    const { merchantId, memberId } = req.membership;
    const format: ExportFormat = body.format === 'XLSX' ? 'XLSX' : 'CSV';
    const filters: ExportFilters = {
      kind: body.kind ?? 'transactions',
      date_from: body.date_from,
      date_to: body.date_to,
      status: body.status,
      operator: body.operator,
      till_id: body.till_id,
    };
    return this.exports.createJob(merchantId, memberId, mode === 'live', format, filters);
  }

  @Get()
  async list(@Param('merchantId') _merchantId: string, @Req() req: any) {
    return this.exports.listJobs(req.membership.merchantId);
  }

  @Get(':jobId')
  async status(
    @Param('merchantId') _merchantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: any,
  ) {
    const job = await this.exports.getJob(jobId, req.membership.merchantId);
    if (!job) throw new NotFoundException('Export introuvable');
    return job;
  }

  @Get(':jobId/download')
  @ApiOperation({ summary: "Télécharger le fichier d'un export terminé" })
  async download(
    @Param('merchantId') _merchantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const file = await this.exports.download(jobId, req.membership.merchantId);
    if (!file) throw new NotFoundException('Export introuvable ou pas encore prêt');
    res.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' });
    res.send(file.body);
  }
}
