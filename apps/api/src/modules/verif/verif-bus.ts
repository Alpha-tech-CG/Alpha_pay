import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

/** Confirmation Vérif diffusée en temps réel (§M5). Aucune donnée personnelle en clair. */
export interface VerifEvent {
  merchantId: string;
  tillId: string | null;
  payment: {
    id: string;
    ref: string;
    amount: number;
    currency: string;
    amount_display: string;
    operator: string;
    payer: string;
    store_id: string | null;
    till_id: string | null;
    till_name: string | null;
    livemode: boolean;
    at: string;
  };
  message: string;
}

/**
 * Bus Vérif : le worker (relances) ou n'importe quelle instance d'API (callbacks)
 * publie, chaque instance d'API délivre à ses flux SSE locaux. Redis pub/sub si
 * REDIS_URL est défini, émetteur local sinon (instance unique, tests).
 */
@Injectable()
export class VerifBus implements OnModuleInit, OnModuleDestroy {
  private static readonly CHANNEL = 'alphapay:verif';
  private readonly logger = new Logger(VerifBus.name);
  private readonly local = new EventEmitter();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  constructor() {
    this.local.setMaxListeners(0);
  }

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    this.publisher = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    this.subscriber = new Redis(url);
    this.publisher.on('error', (err) => this.logger.error(`Redis (publication Vérif) : ${err?.message}`));
    this.subscriber.on('error', (err) => this.logger.error(`Redis (abonnement Vérif) : ${err?.message}`));
    this.subscriber.subscribe(VerifBus.CHANNEL).catch((err) => this.logger.error(`Abonnement Vérif échoué : ${err?.message}`));
    this.subscriber.on('message', (channel, raw) => {
      if (channel !== VerifBus.CHANNEL) return;
      try {
        this.local.emit('event', JSON.parse(raw));
      } catch {
        /* message illisible : ignoré */
      }
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  async publish(event: VerifEvent): Promise<void> {
    if (this.publisher) {
      try {
        await this.publisher.publish(VerifBus.CHANNEL, JSON.stringify(event));
        return;
      } catch (err: any) {
        this.logger.error(`Publication Vérif échouée, diffusion locale seule : ${err?.message}`);
      }
    }
    this.local.emit('event', event);
  }

  /** Abonne un flux ; renvoie la fonction de désabonnement. */
  subscribe(listener: (event: VerifEvent) => void): () => void {
    this.local.on('event', listener);
    return () => this.local.off('event', listener);
  }
}
