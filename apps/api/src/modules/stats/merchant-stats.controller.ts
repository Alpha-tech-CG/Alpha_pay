import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { MerchantStatsService } from './merchant-stats.service';

@ApiTags('Statistiques (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/stats')
@UseGuards(SessionGuard, RequireMemberGuard)
export class MerchantStatsController {
  constructor(private readonly stats: MerchantStatsService) {}

  @Get()
  @ApiOperation({ summary: 'Indicateurs jour/semaine/mois, répartition opérateur, taux d\'échec' })
  get(@Param('merchantId') _merchantId: string, @Query('mode') mode: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.stats.getStats(merchantId, mode === 'live');
  }
}
