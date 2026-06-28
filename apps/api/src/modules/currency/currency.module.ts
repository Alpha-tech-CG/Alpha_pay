import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { CurrencyController, CurrencyAdminController } from './currency.controller';
import { CurrencyService } from './currency.service';

@Module({
  imports: [LedgerModule],
  controllers: [CurrencyController, CurrencyAdminController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
