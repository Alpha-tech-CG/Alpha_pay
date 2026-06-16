import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  getStats() {
    return this.statsService.getStats();
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'PayBrain API', version: '2.0.0', stack: 'NestJS' };
  }
}
