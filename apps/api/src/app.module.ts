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
import { SettlementModule } from './modules/settlement/settlement.module';
import { KycModule } from './modules/kyc/kyc.module';
import { UssdModule } from './modules/ussd/ussd.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { ClerkModule } from './modules/clerk/clerk.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { TeamModule } from './modules/team/team.module';
import { DatabaseModule } from './database.module';
import { SchedulingModule } from './common/scheduling/scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SchedulingModule,
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
    SettlementModule,
    KycModule,
    UssdModule,
    CurrencyModule,
    MetricsModule,
    ClerkModule,
    OnboardingModule,
    WalletModule,
    MerchantModule,
    TeamModule,
  ],
})
export class AppModule {}
