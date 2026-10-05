import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { StatsService } from './stats.service';

@ApiTags('Statistiques')
@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // Statistiques du marchand authentifié UNIQUEMENT (isolation multi-tenant) :
  // le périmètre vient de la clé API, jamais d'un paramètre client.
  @Get('stats')
  @ApiSecurity('ApiKey')
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequiredScopes('payments:read')
  getStats(@Req() req: any) {
    return this.statsService.getStats(req.merchant.id);
  }

  // Public : sonde de vie (healthcheck Docker / reverse proxy).
  @Get('health')
  health() {
    return { status: 'ok', service: 'PayBrain API', version: '2.0.0', stack: 'NestJS' };
  }
}
