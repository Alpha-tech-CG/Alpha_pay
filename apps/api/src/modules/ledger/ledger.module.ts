import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { LedgerSnapshotCron } from './ledger-snapshot.cron';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, LedgerSnapshotCron],
  exports: [LedgerService],
})
export class LedgerModule {}
