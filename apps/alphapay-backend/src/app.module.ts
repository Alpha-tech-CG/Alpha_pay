import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { QueuesModule } from './queues/queues.module';

import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { KycModule } from './modules/kyc/kyc.module';
import { FxModule } from './modules/fx/fx.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CardsModule } from './modules/cards/cards.module';
import { RemittanceModule } from './modules/remittance/remittance.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { QrModule } from './modules/qr/qr.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    // Global default rate limit; stricter per-route caps applied with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    CommonModule,
    RedisModule,
    DatabaseModule,
    ConnectorsModule,
    QueuesModule,
    UsersModule,
    AuthModule,
    KycModule,
    FxModule,
    PaymentsModule,
    CardsModule,
    RemittanceModule,
    MerchantsModule,
    QrModule,
    DeveloperModule,
    WebhooksModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
