import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PaylinksModule } from './modules/paylinks/paylinks.module';
import { StatsModule } from './modules/stats/stats.module';
import { DatabaseModule } from './database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    PaymentsModule,
    WebhooksModule,
    PaylinksModule,
    StatsModule,
  ],
})
export class AppModule {}
