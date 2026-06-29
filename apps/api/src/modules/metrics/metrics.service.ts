import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly paymentsTotal = new Counter({
    name: 'paybrain_payments_total',
    help: 'Nombre total de paiements initiés',
    labelNames: ['operator', 'status'],
    registers: [this.registry],
  });

  readonly paymentDuration = new Histogram({
    name: 'paybrain_payment_duration_seconds',
    help: 'Durée des appels opérateur mobile money',
    labelNames: ['operator'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  readonly webhooksTotal = new Counter({
    name: 'paybrain_webhooks_received_total',
    help: 'Webhooks entrants reçus par opérateur et résultat HMAC',
    labelNames: ['operator', 'result'],
    registers: [this.registry],
  });

  readonly settlementsTotal = new Counter({
    name: 'paybrain_settlements_total',
    help: 'Reversements marchands déclenchés',
    labelNames: ['status', 'currency'],
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry, prefix: 'paybrain_node_' });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
