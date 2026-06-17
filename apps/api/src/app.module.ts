import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PaylinksModule } from './modules/paylinks/paylinks.module';
import { StatsModule } from './modules/stats/stats.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { WebhooksOutModule } from './modules/webhooks-out/webhooks-out.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { DatabaseModule } from './database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    PaymentsModule,
    WebhooksModule,
    PaylinksModule,
    StatsModule,
    OutboxModule,
    LedgerModule,
    ApiKeysModule,
    WebhooksOutModule,
    ReconciliationModule,
    NotificationModule,
  ],
})
export class AppModule {}
