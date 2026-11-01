import { PersonalModule } from './modules/personal/personal.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PaymentLinksModule } from './modules/payment-links/payment-links.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { DevelopersModule } from './modules/developers/developers.module';
import { KybModule } from './modules/kyb/kyb.module';
import { PaymentHooksModule } from './common/payments/payment-hooks';
import { StatsModule } from './modules/stats/stats.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { WebhooksOutModule } from './modules/webhooks-out/webhooks-out.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { TeamModule } from './modules/team/team.module';
import { DatabaseModule } from './database.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { QueueModule } from './common/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { KvModule } from './common/kv/kv.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { AuthModule } from './modules/auth/auth.module';
import { StoresModule } from './modules/stores/stores.module';
import { CashEntriesModule } from './modules/cash-entries/cash-entries.module';
import { ExportsModule } from './modules/exports/exports.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { SchoolModule } from './modules/school/school.module';
import { BillingModule } from './modules/billing/billing.module';
import { StaffModule } from './modules/staff/staff.module';
import { SupportModule } from './modules/support/support.module';
import { CardAcquirerModule } from './modules/card-acquirer/card-acquirer.module';
import { AuditModule } from './common/audit/audit.service';
import { PaymentStatusModule } from './modules/payment-status/payment-status.module';
import { SchedulingModule } from './common/scheduling/scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ProvidersModule,
    QueueModule,
    HealthModule,
    KvModule,
    MessagingModule,
    AuditModule,
    AuthModule,
    StoresModule,
    CashEntriesModule,
    ExportsModule,
    InvoicingModule,
    SchoolModule,
    BillingModule,
    StaffModule,
    SupportModule,
    CardAcquirerModule,
    PaymentStatusModule,
    SchedulingModule,
    PaymentsModule,
    WebhooksModule,
    PaymentLinksModule,
    CheckoutModule,
    DevelopersModule,
    KybModule,
    PaymentHooksModule,
    StatsModule,
    OutboxModule,
    ApiKeysModule,
    WebhooksOutModule,
    ReconciliationModule,
    NotificationModule,
    MetricsModule,
    MerchantModule,
    TeamModule,
    PersonalModule,
  ],
})
export class AppModule {}
