import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { Transaction } from '@paybrain/database';

export type PaymentSucceededHandler = (tx: Transaction) => Promise<void>;

/**
 * Point d'extension « paiement réussi » : la facturation AlphaPay (M11) et le
 * recouvrement (M7) s'y abonnent sans dépendre du module des webhooks
 * (aucune dépendance circulaire). Appelé une seule fois par paiement, après la
 * transition vers SUCCEEDED ; un abonné en échec n'empêche pas les autres.
 */
@Injectable()
export class PaymentHooks {
  private readonly logger = new Logger(PaymentHooks.name);
  private readonly handlers: { name: string; fn: PaymentSucceededHandler }[] = [];

  onSucceeded(name: string, fn: PaymentSucceededHandler): void {
    this.handlers.push({ name, fn });
  }

  async succeeded(tx: Transaction): Promise<void> {
    for (const h of this.handlers) {
      try {
        await h.fn(tx);
      } catch (err) {
        this.logger.error(`Abonné « ${h.name} » en échec pour le paiement ${tx.id} : ${(err as Error).message}`);
      }
    }
  }
}

@Global()
@Module({ providers: [PaymentHooks], exports: [PaymentHooks] })
export class PaymentHooksModule {}
