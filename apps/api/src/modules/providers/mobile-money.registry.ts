import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import {
  airtelProviderFactory,
  MobileMoneyProvider,
  MobileMoneyProviderFactory,
  mockProviderFactory,
  mtnProviderFactory,
  ProviderError,
  TokenCache,
} from '@paybrain/providers';
import { decryptCredentials } from './credentials-crypto';

export type MobileMoneyOperator = 'MTN' | 'AIRTEL';

/** Opérateurs connus. Ajouter un opérateur = une fabrique ici (+ valeur d'enum). */
const FACTORIES: Record<MobileMoneyOperator, MobileMoneyProviderFactory> = {
  MTN: mtnProviderFactory,
  AIRTEL: airtelProviderFactory,
};

export const TOKEN_CACHE = Symbol('TOKEN_CACHE');

/**
 * Résout l'adaptateur Mobile Money d'un paiement.
 *
 * - **Live** : connexion `production` du marchand, obligatoire (les fonds vont
 *   sur SON compte). Absente → `not_configured`.
 * - **Test** : opérateur factice par défaut ; si `MOBILE_MONEY_TEST_PROVIDER=sandbox`
 *   et que le marchand a connecté son compte sandbox, le vrai sandbox opérateur.
 */
@Injectable()
export class MobileMoneyRegistry {
  private readonly mock = mockProviderFactory.create({ environment: 'sandbox', credentials: {} });

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(TOKEN_CACHE) private readonly tokenCache: TokenCache,
  ) {}

  async forMerchant(merchantId: string, operator: MobileMoneyOperator, livemode: boolean): Promise<MobileMoneyProvider> {
    const useSandbox = process.env.MOBILE_MONEY_TEST_PROVIDER === 'sandbox';
    if (!livemode && !useSandbox) return this.mock;

    const connection = await this.prisma.providerConnection.findUnique({
      where: { merchantId_operator_livemode: { merchantId, operator, livemode } },
    });
    if (!connection || connection.status !== 'ACTIVE' || !connection.credentialsEnc) {
      if (!livemode) return this.mock;
      throw new ProviderError('not_configured', `Compte ${operator} du marchand non connecté`, {
        provider: operator.toLowerCase(),
      });
    }

    return FACTORIES[operator].create(
      {
        environment: connection.environment === 'production' ? 'production' : 'sandbox',
        credentials: decryptCredentials(connection.credentialsEnc),
        callbackUrl: this.callbackUrl(operator),
      },
      { tokenCache: this.tokenCache },
    );
  }

  private callbackUrl(operator: MobileMoneyOperator): string | undefined {
    const base = process.env.PUBLIC_API_URL;
    return base ? `${base.replace(/\/$/, '')}/webhooks/${operator.toLowerCase()}` : undefined;
  }
}
