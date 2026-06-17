import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { WebhooksOutModule } from '../webhooks-out/webhooks-out.module';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { SettlementCron } from './settlement.cron';

@Module({
  imports: [LedgerModule, WebhooksOutModule],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementCron],
})
export class SettlementModule {}
