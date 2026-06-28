import { Module } from '@nestjs/common';
import { CurrencyController, CurrencyAdminController } from './currency.controller';
import { CurrencyService } from './currency.service';

@Module({
  controllers: [CurrencyController, CurrencyAdminController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
