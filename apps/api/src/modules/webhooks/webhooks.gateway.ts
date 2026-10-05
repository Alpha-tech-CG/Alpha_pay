import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import Redis from 'ioredis';
import type { IncomingMessage } from 'http';
import { PrismaClient } from '@paybrain/database';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

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

  // Marchand authentifié de chaque socket ; absent = rien n'est délivré.
  private readonly merchantByClient = new WeakMap<WebSocket, string>();
  private readonly apiKeyGuard: ApiKeyGuard;

  constructor(@Inject('PRISMA') prisma: PrismaClient) {
    this.apiKeyGuard = new ApiKeyGuard(prisma);
  }

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

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    try {
      const merchantId = await this.authenticate(request);
      this.merchantByClient.set(client, merchantId);
      client.send(JSON.stringify({ event: 'connected', data: { service: 'PayBrain' }, ts: Date.now() }));
    } catch {
      client.close(1008, 'Unauthorized'); // 1008 = policy violation
    }
  }

  /**
   * Réutilise ApiKeyGuard (hachage, révocation, marchand actif, allowlist IP,
   * anti-timing) sur la requête d'upgrade HTTP. L'IP suit la même règle que
   * `trust proxy = 1` côté Express : dernière entrée de X-Forwarded-For.
   */
  private async authenticate(request: IncomingMessage): Promise<string> {
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim();
    const req: any = {
      headers: request.headers,
      ip: forwarded || request.socket?.remoteAddress,
      socket: request.socket,
    };
    await this.apiKeyGuard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as any);

    const scopes: string[] = req.apiKeyScopes ?? [];
    // Même modèle que ScopesGuard : clé sans scope = accès complet.
    if (scopes.length > 0 && !scopes.includes('payments:read')) throw new Error('insufficient_scope');
    return req.merchant.id;
  }

  /** Diffuse un événement aux seuls clients connectés du marchand donné. */
  broadcastToMerchant(merchantId: string, event: string, data: unknown) {
    const msg = JSON.stringify({ merchantId, event, data, ts: Date.now() });
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

  private deliverLocal(raw: string) {
    let envelope: { merchantId?: string; event: string; data: unknown; ts: number };
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }
    // Fail-closed : un message sans marchand n'est délivré à personne.
    const { merchantId, ...payload } = envelope;
    if (!merchantId) return;

    const msg = JSON.stringify(payload);
    this.server?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && this.merchantByClient.get(client) === merchantId) {
        client.send(msg);
      }
    });
  }
}
