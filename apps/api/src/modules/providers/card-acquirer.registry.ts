import { Inject, Injectable } from '@nestjs/common';
import { ANY_MODE, PrismaClient } from '@paybrain/database';
import { CardAcquirer, CardStateStore, MockCardAcquirer, ProviderError } from '@paybrain/providers';
import { KvStore } from '../../common/kv/kv-store';
import { decryptCredentials } from './credentials-crypto';

/** Carte activée sur la plateforme (§M13) ; désactivée, aucune trace dans l'interface ni l'API. */
export function cardPaymentsEnabled(): boolean {
  return process.env.FEATURE_CARD_PAYMENTS === 'true';
}

/** Secret des webhooks de l'acquéreur factice (test et préproduction seulement). */
export function mockCardWebhookSecret(): string {
  return process.env.MOCK_CARD_WEBHOOK_SECRET ?? 'mock-card-secret';
}

/**
 * Fabriques d'acquéreurs réels, par nom (`CARD_ACQUIRER`). Brancher le
 * partenaire signé = un adaptateur dans `packages/providers/src/card/` et une
 * entrée ici ; les identifiants de chaque marchand sont saisis dans ses
 * Comptes opérateur (connexion CARD, chiffrée).
 */
export const CARD_ACQUIRER_FACTORIES: Record<string, (credentials: Record<string, string>, environment: 'sandbox' | 'production') => CardAcquirer> = {};

/** Préfixe des clés Redis de l'acquéreur factice. */
class KvCardState implements CardStateStore {
  constructor(private readonly kv: KvStore) {}
  get(key: string) {
    return this.kv.get(`mockcard:${key}`);
  }
  set(key: string, value: string, ttlSeconds: number) {
    return this.kv.set(`mockcard:${key}`, value, ttlSeconds);
  }
}

/**
 * Résout l'acquéreur carte d'un paiement, comme `MobileMoneyRegistry` :
 * - **test** : acquéreur factice, état partagé entre API et worker (Redis) ;
 * - **live** : contrat carte du marchand (connexion CARD active), via
 *   l'adaptateur du partenaire configuré. Absent → `not_configured`.
 */
@Injectable()
export class CardAcquirerRegistry {
  readonly mock: MockCardAcquirer;

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    kv: KvStore,
  ) {
    const base = (process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    this.mock = new MockCardAcquirer({ webhookSecret: mockCardWebhookSecret(), baseUrl: base, store: new KvCardState(kv), ttlSeconds: 30 * 60 });
  }

  async forMerchant(merchantId: string, livemode: boolean): Promise<CardAcquirer> {
    if (!livemode) return this.mock;
    const connection = await this.prisma.providerConnection.findUnique({
      where: { merchantId_operator_livemode: { merchantId, operator: 'CARD', livemode: true } },
    });
    if (!connection || connection.status !== 'ACTIVE' || !connection.credentialsEnc) {
      throw new ProviderError('not_configured', 'Contrat carte du marchand non connecté', { provider: 'card' });
    }
    return this.fromConnection(connection);
  }

  /** La carte peut-elle être proposée pour ce marchand et ce mode ? */
  async available(merchantId: string, livemode: boolean): Promise<boolean> {
    if (!cardPaymentsEnabled()) return false;
    if (!livemode) return true;
    const connection = await this.prisma.providerConnection.findFirst({
      where: { merchantId, operator: 'CARD', livemode: true, status: 'ACTIVE' },
      select: { id: true },
    });
    return connection != null && this.adapterName() != null;
  }

  /** Acquéreur d'une connexion, pour vérifier la signature d'un webhook reçu sur son URL. */
  async forConnection(connectionId: string): Promise<{ acquirer: CardAcquirer; merchantId: string; livemode: boolean } | null> {
    const connection = await this.prisma.providerConnection.findFirst({ where: { id: connectionId, livemode: ANY_MODE } });
    if (!connection || connection.operator !== 'CARD' || !connection.credentialsEnc) return null;
    return { acquirer: this.fromConnection(connection), merchantId: connection.merchantId, livemode: connection.livemode };
  }

  private adapterName(): string | null {
    const name = process.env.CARD_ACQUIRER;
    return name && CARD_ACQUIRER_FACTORIES[name] ? name : null;
  }

  private fromConnection(connection: { credentialsEnc: Uint8Array | Buffer | null; environment: string }): CardAcquirer {
    const name = this.adapterName();
    if (!name) throw new ProviderError('not_configured', 'Aucun acquéreur carte configuré (CARD_ACQUIRER)', { provider: 'card' });
    return CARD_ACQUIRER_FACTORIES[name](
      decryptCredentials(connection.credentialsEnc as any),
      connection.environment === 'production' ? 'production' : 'sandbox',
    );
  }
}
