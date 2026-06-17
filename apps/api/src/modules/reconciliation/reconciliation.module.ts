import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationCron } from './reconciliation.cron';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationCron],
})
export class ReconciliationModule {}
