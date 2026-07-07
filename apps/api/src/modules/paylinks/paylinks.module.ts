import { Module } from '@nestjs/common';
import { PaylinksController } from './paylinks.controller';
import { PaylinksService } from './paylinks.service';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [PaymentsModule, WalletModule],
  controllers: [PaylinksController],
  providers: [PaylinksService],
})
export class PaylinksModule {}
