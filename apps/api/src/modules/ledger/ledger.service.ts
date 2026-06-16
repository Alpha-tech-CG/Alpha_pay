import { createHash, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AccountType, Prisma, PrismaClient } from '@paybrain/database';
import { EmptyEntryError, UnbalancedEntryError } from './ledger.errors';

export interface JournalLine {
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  currency: string;
  description?: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  entriesChecked: number;
  brokenAtSequence: string | null;
  reason?: string;
}

export const GENESIS_HASH = '0'.repeat(64);
const MAX_SERIALIZATION_RETRIES = 5;

@Injectable()
export class LedgerService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /**
   * Pose un lot d'écritures en partie double dans une seule transaction
   * SERIALIZABLE. Le chaînage de hash dépend de la lecture de la dernière
   * ligne — sous SERIALIZABLE, deux appels concurrents qui liraient la même
   * "dernière ligne" provoquent un échec de sérialisation Postgres (40001)
   * sur l'un des deux, qu'on retente automatiquement. C'est ce mécanisme qui
   * garantit l'intégrité du chaînage sans verrou explicite.
   */
  async postEntry(lines: JournalLine[], transactionId = randomUUID()): Promise<string> {
    if (lines.length === 0) throw new EmptyEntryError();
    this.assertBalanced(lines);

    const resolvedLines = await Promise.all(
      lines.map(async (line) => ({ ...line, accountId: await this.ensureAccount(line.accountId) })),
    );

    for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const last = await tx.journalEntry.findFirst({ orderBy: { sequence: 'desc' } });
            let prevHash = last?.hash ?? GENESIS_HASH;

            for (const line of resolvedLines) {
              const content = [
                transactionId,
                line.accountId,
                line.direction,
                line.amount.toFixed(2),
                line.currency,
                line.description ?? '',
              ].join('|');
              const hash = createHash('sha256').update(prevHash + content).digest('hex');

              await tx.journalEntry.create({
                data: {
                  transactionId,
                  accountId: line.accountId,
                  direction: line.direction,
                  amount: line.amount,
                  currency: line.currency,
                  description: line.description,
                  prevHash,
                  hash,
                },
              });
              prevHash = hash;
            }

            return transactionId;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err: any) {
        const isSerializationFailure = err.code === 'P2034' || err.meta?.code === '40001';
        if (!isSerializationFailure || attempt === MAX_SERIALIZATION_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 10 * 2 ** attempt + Math.random() * 20));
      }
    }

    throw new Error('postEntry: nombre maximum de tentatives de sérialisation atteint');
  }

  /**
   * Résout un identifiant de compte fourni à l'API : si c'est déjà l'UUID
   * d'un LedgerAccount existant on le réutilise, sinon on traite la valeur
   * comme un nom de compte global et on crée la ligne au premier usage
   * (upsert tolérant aux courses, car NULL n'est pas unique sous Postgres).
   */
  private async ensureAccount(accountIdOrName: string, type: AccountType = 'ASSET'): Promise<string> {
    const existing = await this.resolveExistingAccountId(accountIdOrName);
    if (existing) return existing;

    try {
      const created = await this.prisma.ledgerAccount.create({
        data: { name: accountIdOrName, type, merchantId: null },
      });
      return created.id;
    } catch (err: any) {
      if (err.code === 'P2002') {
        const retried = await this.prisma.ledgerAccount.findFirst({
          where: { name: accountIdOrName, merchantId: null },
        });
        if (retried) return retried.id;
      }
      throw err;
    }
  }

  private async resolveExistingAccountId(accountIdOrName: string): Promise<string | null> {
    const existing = await this.prisma.ledgerAccount.findFirst({
      where: { OR: [{ id: accountIdOrName }, { name: accountIdOrName, merchantId: null }] },
    });
    return existing?.id ?? null;
  }

  private assertBalanced(lines: JournalLine[]): void {
    const sums = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const s = sums.get(line.currency) ?? { debit: 0, credit: 0 };
      if (line.direction === 'DEBIT') s.debit += line.amount;
      else s.credit += line.amount;
      sums.set(line.currency, s);
    }
    for (const [currency, s] of sums) {
      // Comparaison en centimes pour éviter les erreurs d'arrondi flottant.
      const debitCents = Math.round(s.debit * 100);
      const creditCents = Math.round(s.credit * 100);
      if (debitCents !== creditCents) {
        throw new UnbalancedEntryError(currency, s.debit.toFixed(2), s.credit.toFixed(2));
      }
    }
  }

  /**
   * Solde d'un compte = SUM(credit - debit). Repart du dernier snapshot
   * disponible (s'il existe) et n'agrège que les lignes postérieures, pour
   * éviter de rescanner tout l'historique à chaque lecture.
   */
  async getAccountBalance(accountIdOrName: string): Promise<number> {
    const resolved = await this.resolveExistingAccountId(accountIdOrName);
    if (!resolved) return 0;
    const accountId = resolved;

    const snapshot = await this.prisma.ledgerBalanceSnapshot.findFirst({
      where: { accountId },
      orderBy: { asOfSequence: 'desc' },
    });

    const where = snapshot
      ? { accountId, sequence: { gt: snapshot.asOfSequence } }
      : { accountId };

    const [credits, debits] = await Promise.all([
      this.prisma.journalEntry.aggregate({ where: { ...where, direction: 'CREDIT' }, _sum: { amount: true } }),
      this.prisma.journalEntry.aggregate({ where: { ...where, direction: 'DEBIT' }, _sum: { amount: true } }),
    ]);

    const base = snapshot ? Number(snapshot.balance) : 0;
    return base + Number(credits._sum.amount ?? 0) - Number(debits._sum.amount ?? 0);
  }

  async takeSnapshot(accountIdOrName: string): Promise<void> {
    const accountId = await this.resolveExistingAccountId(accountIdOrName);
    if (!accountId) return;

    const last = await this.prisma.journalEntry.findFirst({
      where: { accountId },
      orderBy: { sequence: 'desc' },
    });
    if (!last) return;

    const balance = await this.getAccountBalance(accountId);
    await this.prisma.ledgerBalanceSnapshot.create({
      data: { accountId, balance, asOfSequence: last.sequence },
    });
  }

  /**
   * Recalcule la chaîne de hash sur tout l'historique et la compare aux
   * valeurs stockées — détecte toute altération (UPDATE/DELETE direct en DB,
   * insertion hors séquence, etc).
   */
  async verifyChain(): Promise<ChainVerificationResult> {
    const entries = await this.prisma.journalEntry.findMany({ orderBy: { sequence: 'asc' } });

    let prevHash = GENESIS_HASH;
    for (const entry of entries) {
      if (entry.prevHash !== prevHash) {
        return {
          valid: false,
          entriesChecked: entries.length,
          brokenAtSequence: entry.sequence.toString(),
          reason: 'prevHash ne correspond pas au hash de la ligne précédente',
        };
      }

      const content = [
        entry.transactionId,
        entry.accountId,
        entry.direction,
        Number(entry.amount).toFixed(2),
        entry.currency,
        entry.description ?? '',
      ].join('|');
      const expectedHash = createHash('sha256').update(prevHash + content).digest('hex');

      if (expectedHash !== entry.hash) {
        return {
          valid: false,
          entriesChecked: entries.length,
          brokenAtSequence: entry.sequence.toString(),
          reason: 'hash recalculé ne correspond pas au hash stocké',
        };
      }

      prevHash = entry.hash;
    }

    return { valid: true, entriesChecked: entries.length, brokenAtSequence: null };
  }
}
