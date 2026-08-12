import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../modules/payments/entities/transaction.entity';
import { WebhookEndpoint, WebhookDeliveryLog } from '../modules/developer/entities/developer.entities';
import { PaymentProcessor, PAYMENT_QUEUE } from './payment-processor/payment.processor';
import { WebhookProcessor, WEBHOOK_QUEUE } from './webhook-dispatcher/webhook.processor';

/**
 * BullMQ wiring. Global so any service can `@InjectQueue(...)` to enqueue.
 * Default job options: 3 attempts with exponential backoff (webhook delivery).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { host: config.get<string>('redis.host'), port: config.get<number>('redis.port') },
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
      }),
    }),
    BullModule.registerQueue({ name: PAYMENT_QUEUE }, { name: WEBHOOK_QUEUE }),
    TypeOrmModule.forFeature([Transaction, WebhookEndpoint, WebhookDeliveryLog]),
  ],
  providers: [PaymentProcessor, WebhookProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
