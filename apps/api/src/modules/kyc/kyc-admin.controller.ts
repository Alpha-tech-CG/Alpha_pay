import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { KycStatus } from '@paybrain/database';
import { InternalGuard } from '../../common/guards/internal.guard';
import { KycService } from './kyc.service';
import { DecideKycDto } from './dto/kyc.dto';

// Tableau de bord compliance : revue et décision manuelle des dossiers KYC.
@Controller('internal/kyc')
@UseGuards(InternalGuard)
export class KycAdminController {
  constructor(private readonly kyc: KycService) {}

  @Get('cases')
  list(@Query('status') status?: KycStatus) {
    return this.kyc.listCases(status);
  }

  @Get('cases/:id')
  get(@Param('id') id: string) {
    return this.kyc.getCaseById(id);
  }

  @Post('cases/:id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideKycDto) {
    return this.kyc.decide(id, dto.decision, dto.officer, dto.reason);
  }
}
