import { Body, Controller, Get, Injectable, Logger, Module, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { EncryptionService } from '../../common/encryption.service';
import { WEBHOOK_QUEUE } from '../../queues/webhook-dispatcher/webhook.processor';
import { IsArray, IsString, IsUrl } from 'class-validator';
import { WebhookEndpoint, WebhookDeliveryLog } from '../developer/entities/developer.entities';
import { Transaction } from '../payments/entities/transaction.entity';
import { TransactionStatus } from '../../common/types/transaction-status.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class RegisterWebhookDto {
  @IsUrl() url: string;
  @IsArray() events: string[];
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(
    @InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>,
    @InjectRepository(Transaction) private readonly txs: Repository<Transaction>,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
    private readonly encryption: EncryptionService,
  ) {}

  async register(userId: string, dto: RegisterWebhookDto) {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    // Chiffré (réversible) — le worker doit récupérer le secret pour signer le payload
    // avec le MÊME secret que celui remis au marchand. (colonne réutilisée : secretHash.)
    const secretHash = this.encryption.encrypt(secret);
    const ep = await this.endpoints.save(this.endpoints.create({ userId, url: dto.url, events: dto.events, secretHash }));
    return { id: ep.id, url: ep.url, events: ep.events, secret }; // secret shown once
  }

  list(userId: string) {
    return this.endpoints.find({ where: { userId }, select: ['id', 'url', 'events', 'isActive', 'createdAt'] });
  }

  /** Incoming provider callback → update the referenced transaction's status. */
  async ingest(provider: string, body: { externalId?: string; referenceId?: string; status?: string }) {
    this.logger.log(`Incoming ${provider} callback: ${JSON.stringify(body)}`);
    const ref = body.externalId ?? body.referenceId;
    if (ref) {
      const tx = await this.txs.findOne({ where: { id: ref } });
      if (tx && body.status) {
        tx.status =
          body.status === 'SUCCESSFUL' ? TransactionStatus.SUCCESSFUL : body.status === 'FAILED' ? TransactionStatus.FAILED : tx.status;
        await this.txs.save(tx);
        await this.dispatch(tx.userId, `payment.${tx.status.toLowerCase()}`, { transactionId: tx.id, status: tx.status });
      }
    }
    return { received: true };
  }

  /** Enqueue outgoing delivery — the webhook-dispatcher worker signs + delivers with retry/backoff. */
  async dispatch(userId: string, event: string, payload: Record<string, unknown>) {
    await this.queue.add('dispatch', { userId, event, payload });
  }
}

/** Incoming provider callbacks — NOT JWT-guarded (external services call these). */
@Controller('webhooks')
class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}
  @Post(':provider') ingest(@Param('provider') provider: string, @Body() body: Record<string, string>) {
    return this.svc.ingest(provider, body);
  }
}

/** Endpoint management — JWT-guarded. */
@Controller('webhook-endpoints')
@UseGuards(JwtAuthGuard)
class WebhookEndpointsController {
  constructor(private readonly svc: WebhooksService) {}
  @Post() register(@CurrentUser('sub') u: string, @Body() dto: RegisterWebhookDto) { return this.svc.register(u, dto); }
  @Get() list(@CurrentUser('sub') u: string) { return this.svc.list(u); }
}

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEndpoint, WebhookDeliveryLog, Transaction])],
  providers: [WebhooksService],
  controllers: [WebhooksController, WebhookEndpointsController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
