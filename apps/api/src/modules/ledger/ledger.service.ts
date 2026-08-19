import { createHash, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AccountType, JournalEntry, Prisma, PrismaClient } from '@paybrain/database';
import { EmptyEntryError, InvalidAmountError, UnbalancedEntryError } from './ledger.errors';

export interface JournalLine {
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amountCents: bigint | number;
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
  async postEntry(lines: JournalLine[], transactionId: string = randomUUID()): Promise<string> {
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
              const amountCents = this.toCents(line.amountCents);
              const content = [
                transactionId,
                line.accountId,
                line.direction,
                amountCents.toString(),
                line.currency,
                line.description ?? '',
              ].join('|');
              const hash = createHash('sha256').update(prevHash + content).digest('hex');

              await tx.journalEntry.create({
                data: {
                  transactionId,
                  accountId: line.accountId,
                  direction: line.direction,
                  amount: amountCents,
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
   * Enregistre une conversion de devises (ALP-151) dans le grand livre.
   *
   * Le double-entrée équilibre PAR DEVISE (assertBalanced) : on ne peut donc pas
   * mélanger XAF et EUR sur une même paire débit/crédit. La conversion est posée
   * en DEUX jambes équilibrées, reliées par des comptes d'échange `fx-exchange-<DEV>` :
   *   - jambe source : débit compte source / crédit fx-exchange-<A>  (en devise A)
   *   - jambe cible  : débit fx-exchange-<B> / crédit compte cible    (en devise B)
   * L'écart FX (gain/perte de change) est le solde net des comptes d'échange
   * valorisé à un taux de référence — exploitable en reporting.
   */
  async postConversion(params: {
    fromAccount: string;
    toAccount: string;
    amountFromCents: bigint | number;
    currencyFrom: string;
    amountToCents: bigint | number;
    currencyTo: string;
    description?: string;
    transactionId?: string;
  }): Promise<string> {
    const { currencyFrom, currencyTo } = params;
    if (currencyFrom === currencyTo) {
      throw new InvalidAmountError();
    }
    const desc = params.description ?? `FX ${currencyFrom}->${currencyTo}`;
    const lines: JournalLine[] = [
      { accountId: params.fromAccount, direction: 'DEBIT', amountCents: params.amountFromCents, currency: currencyFrom, description: desc },
      { accountId: `fx-exchange-${currencyFrom}`, direction: 'CREDIT', amountCents: params.amountFromCents, currency: currencyFrom, description: desc },
      { accountId: `fx-exchange-${currencyTo}`, direction: 'DEBIT', amountCents: params.amountToCents, currency: currencyTo, description: desc },
      { accountId: params.toAccount, direction: 'CREDIT', amountCents: params.amountToCents, currency: currencyTo, description: desc },
    ];
    return this.postEntry(lines, params.transactionId);
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
    const sums = new Map<string, { debit: bigint; credit: bigint }>();
    for (const line of lines) {
      const s = sums.get(line.currency) ?? { debit: 0n, credit: 0n };
      const amountCents = this.toCents(line.amountCents);
      if (line.direction === 'DEBIT') s.debit += amountCents;
      else s.credit += amountCents;
      sums.set(line.currency, s);
    }
    for (const [currency, s] of sums) {
      if (s.debit !== s.credit) {
        throw new UnbalancedEntryError(currency, s.debit.toString(), s.credit.toString());
      }
    }
  }

  private toCents(amountCents: bigint | number): bigint {
    if (typeof amountCents === 'bigint') {
      if (amountCents <= 0n) throw new InvalidAmountError();
      return amountCents;
    }
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new InvalidAmountError();
    }
    return BigInt(amountCents);
  }

  /**
   * Solde d'un compte = SUM(credit - debit). Repart du dernier snapshot
   * disponible (s'il existe) et n'agrège que les lignes postérieures, pour
   * éviter de rescanner tout l'historique à chaque lecture.
   */
  async getAccountBalance(accountIdOrName: string): Promise<bigint> {
    const resolved = await this.resolveExistingAccountId(accountIdOrName);
    if (!resolved) return 0n;
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

    const base = snapshot ? BigInt(snapshot.balance) : 0n;
    return base + BigInt(credits._sum.amount ?? 0) - BigInt(debits._sum.amount ?? 0);
  }

  async takeSnapshot(accountIdOrName: string): Promise<void> {
    const accountId = await this.resolveExistingAccountId(accountIdOrName);
    if (!accountId) return;
    await this.#snapshotIfNew(accountId);
  }

  /**
   * Fige un snapshot pour `accountId` seulement s'il y a des écritures postérieures
   * au dernier snapshot. Évite les doublons quand le cron repasse souvent.
   * @returns true si un nouveau snapshot a été créé.
   */
  async #snapshotIfNew(accountId: string): Promise<boolean> {
    const last = await this.prisma.journalEntry.findFirst({
      where: { accountId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    if (!last) return false;

    const latestSnapshot = await this.prisma.ledgerBalanceSnapshot.findFirst({
      where: { accountId },
      orderBy: { asOfSequence: 'desc' },
      select: { asOfSequence: true },
    });
    if (latestSnapshot && latestSnapshot.asOfSequence >= last.sequence) return false;

    const balance = await this.getAccountBalance(accountId);
    await this.prisma.ledgerBalanceSnapshot.create({
      data: { accountId, balance, asOfSequence: last.sequence },
    });
    return true;
  }

  /**
   * Fige un snapshot de solde pour tous les comptes ayant de nouvelles écritures.
   * Appelé par le cron ledger : sans snapshots réguliers, getAccountBalance
   * réagrège tout l'historique du compte à chaque lecture (dégradation linéaire).
   * Parcours paginé par curseur pour ne jamais charger tous les comptes en mémoire.
   * @returns nombre de comptes effectivement snapshotés (nouveau point).
   */
  async snapshotAllAccounts(): Promise<number> {
    const BATCH = 500;
    let taken = 0;
    let cursorId: string | null = null;

    for (;;) {
      const accounts: { id: string }[] = await this.prisma.ledgerAccount.findMany({
        take: BATCH,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      if (accounts.length === 0) break;

      for (const account of accounts) {
        if (await this.#snapshotIfNew(account.id)) taken++;
      }

      cursorId = accounts[accounts.length - 1].id;
      if (accounts.length < BATCH) break;
    }

    return taken;
  }

  /**
   * Recalcule la chaîne de hash sur tout l'historique et la compare aux
   * valeurs stockées — détecte toute altération (UPDATE/DELETE direct en DB,
   * insertion hors séquence, etc).
   */
  async verifyChain(): Promise<ChainVerificationResult> {
    // Parcours paginé par curseur (sequence) : le journal grandit sans borne, le
    // charger d'un bloc en mémoire finirait en OOM. On conserve prevHash d'un lot
    // au suivant pour vérifier le chaînage sans discontinuité.
    const BATCH = 1000;
    let prevHash = GENESIS_HASH;
    let entriesChecked = 0;
    let cursorSeq: bigint | null = null;

    for (;;) {
      const entries: JournalEntry[] = await this.prisma.journalEntry.findMany({
        where: cursorSeq !== null ? { sequence: { gt: cursorSeq } } : undefined,
        orderBy: { sequence: 'asc' },
        take: BATCH,
      });
      if (entries.length === 0) break;

      for (const entry of entries) {
        entriesChecked++;
        if (entry.prevHash !== prevHash) {
          return {
            valid: false,
            entriesChecked,
            brokenAtSequence: entry.sequence.toString(),
            reason: 'prevHash ne correspond pas au hash de la ligne précédente',
          };
        }

        const content = [
          entry.transactionId,
          entry.accountId,
          entry.direction,
          BigInt(entry.amount).toString(),
          entry.currency,
          entry.description ?? '',
        ].join('|');
        const expectedHash = createHash('sha256').update(prevHash + content).digest('hex');

        if (expectedHash !== entry.hash) {
          return {
            valid: false,
            entriesChecked,
            brokenAtSequence: entry.sequence.toString(),
            reason: 'hash recalculé ne correspond pas au hash stocké',
          };
        }

        prevHash = entry.hash;
      }

      cursorSeq = entries[entries.length - 1].sequence;
      if (entries.length < BATCH) break;
    }

    return { valid: true, entriesChecked, brokenAtSequence: null };
  }
}
