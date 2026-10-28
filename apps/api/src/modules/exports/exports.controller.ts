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
  UseGuards,
} from '@nestjs/common';
import { ExportFormat } from '@paybrain/database';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { can } from '../team/permissions/permissions';
import { ExportFilters, ExportsService } from './exports.service';

class CreateExportDto {
  format?: 'CSV' | 'XLSX';
  date_from?: string;
  date_to?: string;
  status?: string;
  operator?: string;
  till_id?: string;
}

@Controller('v1/merchants/:merchantId/exports')
@UseGuards(SessionGuard, RequireMemberGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  async create(
    @Param('merchantId') _merchantId: string,
    @Req() req: any,
    @Body() body: CreateExportDto,
  ) {
    if (!can(req.membership, 'exports:create')) {
      throw new NotFoundException('Action non autorisée');
    }
    const { merchantId, id: memberId } = req.membership;
    const livemode = req.livemode ?? false;
    const format: ExportFormat = body.format === 'XLSX' ? 'XLSX' : 'CSV';
    const filters: ExportFilters = {
      date_from: body.date_from,
      date_to: body.date_to,
      status: body.status,
      operator: body.operator,
      till_id: body.till_id,
    };
    return this.exports.createJob(merchantId, memberId, livemode, format, filters);
  }

  @Get()
  async list(@Param('merchantId') _merchantId: string, @Req() req: any) {
    if (!can(req.membership, 'exports:create')) {
      throw new NotFoundException('Action non autorisée');
    }
    const { merchantId } = req.membership;
    return this.exports.listJobs(merchantId);
  }

  @Get(':jobId')
  async status(
    @Param('merchantId') _merchantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: any,
  ) {
    if (!can(req.membership, 'exports:create')) {
      throw new NotFoundException('Action non autorisée');
    }
    const { merchantId } = req.membership;
    const job = await this.exports.getJob(jobId, merchantId);
    if (!job) throw new NotFoundException('Export introuvable');
    return job;
  }
}
