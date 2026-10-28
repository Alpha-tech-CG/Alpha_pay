import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { MerchantStatsController } from './merchant-stats.controller';
import { MerchantStatsService } from './merchant-stats.service';
import { TeamAuthModule } from '../team/auth/team-auth.module';

@Module({
  imports: [TeamAuthModule],
  controllers: [StatsController, MerchantStatsController],
  providers: [StatsService, MerchantStatsService],
})
export class StatsModule {}
