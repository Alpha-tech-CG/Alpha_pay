import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import Redis from 'ioredis';

/**
 * Passerelle temps-réel (statut de transaction pour le dashboard).
 *
 * `server.clients` ne référence que les clients connectés à CETTE instance. En
 * multi-instance, un `transaction_update` déclenché sur le pod qui reçoit le
 * webhook opérateur n'atteindrait pas un dashboard connecté à un autre pod.
 *
 * Fanout inter-instances via Redis pub/sub : `broadcast()` publie sur un canal ;
 * chaque instance (y compris l'émettrice, via sa propre souscription) délivre le
 * message à ses clients WebSocket locaux. Gate sur REDIS_URL : sans Redis (dev
 * local, instance unique), on délivre directement en local — comportement
 * historique préservé.
 */
@WebSocketGateway({ path: '/' })
export class WebhooksGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksGateway.name);
  private static readonly CHANNEL = 'paybrain:ws:broadcast';

  @WebSocketServer()
  server!: Server;

  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) return; // instance unique : fanout local direct

    this.publisher = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    this.subscriber = new Redis(url);
    this.publisher.on('error', (err) => this.logger.error(`Redis pub indisponible: ${err?.message}`));
    this.subscriber.on('error', (err) => this.logger.error(`Redis sub indisponible: ${err?.message}`));

    this.subscriber.subscribe(WebhooksGateway.CHANNEL).catch((err) =>
      this.logger.error(`Abonnement Redis échoué: ${err?.message}`),
    );
    this.subscriber.on('message', (channel, message) => {
      if (channel === WebhooksGateway.CHANNEL) this.deliverLocal(message);
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  handleConnection(client: WebSocket) {
    client.send(JSON.stringify({ event: 'connected', data: { service: 'PayBrain' }, ts: Date.now() }));
  }

  broadcast(event: string, data: unknown) {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    if (this.publisher) {
      // Toutes les instances (dont celle-ci) délivreront via leur souscription.
      this.publisher.publish(WebhooksGateway.CHANNEL, msg).catch((err) => {
        this.logger.error(`Publication Redis échouée, fanout local seul: ${err?.message}`);
        this.deliverLocal(msg); // au moins les clients locaux reçoivent l'événement
      });
      return;
    }
    this.deliverLocal(msg);
  }

  private deliverLocal(msg: string) {
    this.server?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }
}
