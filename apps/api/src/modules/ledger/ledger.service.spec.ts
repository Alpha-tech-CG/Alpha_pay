import * as fc from 'fast-check';
import { createHash, randomUUID } from 'crypto';
import { GENESIS_HASH, LedgerService } from './ledger.service';
import { EmptyEntryError, InvalidAmountError, UnbalancedEntryError } from './ledger.errors';

/**
 * In-memory fake Prisma client that models just enough of the schema to
 * exercise LedgerService: an append-only journal_entries table with a
 * monotonic sequence, plus a snapshots table. Good enough to test balance
 * validation, hash chaining, and chain verification without a real DB —
 * the SERIALIZABLE retry path itself is exercised separately below by
 * forcing a P2034 on the first attempt.
 */
function createFakePrisma(): any {
  const journalEntries: any[] = [];
  const snapshots: any[] = [];
  const accounts: any[] = [];
  let sequence = 0n;
  let forceSerializationFailureOnce = false;

  const prisma = {
    __forceSerializationFailureOnce: () => {
      forceSerializationFailureOnce = true;
    },
    ledgerAccount: {
      findFirst: async ({ where }: any) => {
        if (where?.OR) {
          return (
            accounts.find((a) => where.OR.some((cond: any) => (cond.id ? a.id === cond.id : a.name === cond.name))) ??
            null
          );
        }
        return accounts.find((a) => a.name === where.name) ?? null;
      },
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        accounts.push(row);
        return row;
      },
    },
    journalEntry: {
      findFirst: async ({ where, orderBy }: any) => {
        let rows = journalEntries;
        if (where?.accountId) rows = rows.filter((r) => r.accountId === where.accountId);
        if (rows.length === 0) return null;
        const sorted = [...rows].sort((a, b) => Number(b.sequence - a.sequence));
        return orderBy?.sequence === 'asc' ? sorted[sorted.length - 1] : sorted[0];
      },
      findMany: async ({ orderBy }: any) => {
        const sorted = [...journalEntries].sort((a, b) => Number(a.sequence - b.sequence));
        return orderBy?.sequence === 'desc' ? sorted.reverse() : sorted;
      },
      create: async ({ data }: any) => {
        sequence += 1n;
        const row = { id: randomUUID(), sequence, ...data };
        journalEntries.push(row);
        return row;
      },
      aggregate: async ({ where }: any) => {
        let rows = journalEntries.filter((r) => r.accountId === where.accountId && r.direction === where.direction);
        if (where.sequence?.gt !== undefined) rows = rows.filter((r) => r.sequence > where.sequence.gt);
        const sum = rows.reduce((acc, r) => acc + BigInt(r.amount), 0n);
        return { _sum: { amount: rows.length ? sum : null } };
      },
    },
    ledgerBalanceSnapshot: {
      findFirst: async ({ where, orderBy }: any) => {
        const rows = snapshots.filter((s) => s.accountId === where.accountId);
        if (rows.length === 0) return null;
        const sorted = [...rows].sort((a, b) => Number(b.asOfSequence - a.asOfSequence));
        return orderBy?.asOfSequence === 'desc' ? sorted[0] : sorted[sorted.length - 1];
      },
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        snapshots.push(row);
        return row;
      },
    },
    $transaction: async (fn: any) => {
      if (forceSerializationFailureOnce) {
        forceSerializationFailureOnce = false;
        const err: any = new Error('could not serialize access due to concurrent update');
        err.code = 'P2034';
        throw err;
      }
      return fn(prisma);
    },
  };

  return prisma;
}

describe('LedgerService', () => {
  let prisma: any;
  let service: LedgerService;

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new LedgerService(prisma);
  });

  it('rejects an empty batch', async () => {
    await expect(service.postEntry([])).rejects.toThrow(EmptyEntryError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amountCents: %s',
    async (amountCents) => {
      await expect(
        service.postEntry([
          { accountId: 'a', direction: 'DEBIT', amountCents, currency: 'EUR' },
          { accountId: 'b', direction: 'CREDIT', amountCents, currency: 'EUR' },
        ]),
      ).rejects.toThrow(InvalidAmountError);
    },
  );

  it('rejects an unbalanced batch (sum debit !== sum credit)', async () => {
    await expect(
      service.postEntry([
        { accountId: 'a', direction: 'DEBIT', amountCents: 10000, currency: 'EUR' },
        { accountId: 'b', direction: 'CREDIT', amountCents: 9900, currency: 'EUR' },
      ]),
    ).rejects.toThrow(UnbalancedEntryError);
  });

  it('accepts a balanced batch and persists one row per line', async () => {
    const txId = await service.postEntry([
      { accountId: 'merchant-wallet', direction: 'DEBIT', amountCents: 10000, currency: 'EUR' },
      { accountId: 'platform-revenue', direction: 'CREDIT', amountCents: 10000, currency: 'EUR' },
    ]);

    const rows = await prisma.journalEntry.findMany({});
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.transactionId === txId)).toBe(true);
  });

  it('chains the first entry off the genesis hash', async () => {
    await service.postEntry([
      { accountId: 'a', direction: 'DEBIT', amountCents: 1000, currency: 'EUR' },
      { accountId: 'b', direction: 'CREDIT', amountCents: 1000, currency: 'EUR' },
    ]);

    const rows = await prisma.journalEntry.findMany({});
    expect(rows[0].prevHash).toBe(GENESIS_HASH);
  });

  it('chains each subsequent entry off the previous entry hash', async () => {
    await service.postEntry([
      { accountId: 'a', direction: 'DEBIT', amountCents: 1000, currency: 'EUR' },
      { accountId: 'b', direction: 'CREDIT', amountCents: 1000, currency: 'EUR' },
    ]);
    await service.postEntry([
      { accountId: 'a', direction: 'CREDIT', amountCents: 500, currency: 'EUR' },
      { accountId: 'b', direction: 'DEBIT', amountCents: 500, currency: 'EUR' },
    ]);

    const rows = await prisma.journalEntry.findMany({});
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].hash);
    }
  });

  it('retries automatically on a SERIALIZABLE conflict (P2034) and succeeds', async () => {
    prisma.__forceSerializationFailureOnce();

    const txId = await service.postEntry([
      { accountId: 'a', direction: 'DEBIT', amountCents: 1000, currency: 'EUR' },
      { accountId: 'b', direction: 'CREDIT', amountCents: 1000, currency: 'EUR' },
    ]);

    expect(txId).toBeDefined();
    const rows = await prisma.journalEntry.findMany({});
    expect(rows).toHaveLength(2);
  });

  describe('getAccountBalance', () => {
    it('computes SUM(credit - debit) for an account', async () => {
      await service.postEntry([
        { accountId: 'wallet', direction: 'CREDIT', amountCents: 10000, currency: 'EUR' },
        { accountId: 'revenue', direction: 'DEBIT', amountCents: 10000, currency: 'EUR' },
      ]);
      await service.postEntry([
        { accountId: 'wallet', direction: 'DEBIT', amountCents: 3000, currency: 'EUR' },
        { accountId: 'revenue', direction: 'CREDIT', amountCents: 3000, currency: 'EUR' },
      ]);

      expect(await service.getAccountBalance('wallet')).toBe(7000n);
      expect(await service.getAccountBalance('revenue')).toBe(-7000n);
    });

    it('uses the latest snapshot as a base and only sums entries after it', async () => {
      await service.postEntry([
        { accountId: 'wallet', direction: 'CREDIT', amountCents: 10000, currency: 'EUR' },
        { accountId: 'revenue', direction: 'DEBIT', amountCents: 10000, currency: 'EUR' },
      ]);
      await service.takeSnapshot('wallet');
      await service.postEntry([
        { accountId: 'wallet', direction: 'CREDIT', amountCents: 2000, currency: 'EUR' },
        { accountId: 'revenue', direction: 'DEBIT', amountCents: 2000, currency: 'EUR' },
      ]);

      expect(await service.getAccountBalance('wallet')).toBe(12000n);
    });
  });

  describe('verifyChain', () => {
    it('reports a valid chain when nothing has been tampered with', async () => {
      await service.postEntry([
        { accountId: 'a', direction: 'DEBIT', amountCents: 1000, currency: 'EUR' },
        { accountId: 'b', direction: 'CREDIT', amountCents: 1000, currency: 'EUR' },
      ]);
      await service.postEntry([
        { accountId: 'a', direction: 'CREDIT', amountCents: 500, currency: 'EUR' },
        { accountId: 'b', direction: 'DEBIT', amountCents: 500, currency: 'EUR' },
      ]);

      const result = await service.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(4);
    });

    it('detects a tampered amount (hash mismatch)', async () => {
      await service.postEntry([
        { accountId: 'a', direction: 'DEBIT', amountCents: 1000, currency: 'EUR' },
        { accountId: 'b', direction: 'CREDIT', amountCents: 1000, currency: 'EUR' },
      ]);

      const rows = await prisma.journalEntry.findMany({});
      rows[0].amount = 99900n; // simulates a direct DB tamper, bypassing the service

      const result = await service.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/hash/);
    });

    it('detects a broken prevHash link', async () => {
      await service.postEntry([
        { accountId: 'a', direction: 'DEBIT', amountCents: 1000, currency: 'EUR' },
        { accountId: 'b', direction: 'CREDIT', amountCents: 1000, currency: 'EUR' },
      ]);
      await service.postEntry([
        { accountId: 'a', direction: 'CREDIT', amountCents: 500, currency: 'EUR' },
        { accountId: 'b', direction: 'DEBIT', amountCents: 500, currency: 'EUR' },
      ]);

      const rows = await prisma.journalEntry.findMany({});
      rows[2].prevHash = 'deadbeef';

      const result = await service.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/prevHash/);
    });
  });

  describe('property-based tests', () => {
    const accountIdArb = fc.constantFrom('acc-1', 'acc-2', 'acc-3', 'acc-4');
    const lineArb = fc.record({
      accountId: accountIdArb,
      amountCents: fc.integer({ min: 1, max: 100_000 }),
    });

    it('any balanced random batch posts successfully and the chain stays valid', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(lineArb, { minLength: 1, maxLength: 6 }), async (debitLines) => {
          const total = debitLines.reduce((s, l) => s + l.amountCents, 0);
          if (total === 0) return true; // évite le cas dégénéré (montant total nul)

          const lines = [
            ...debitLines.map((l) => ({ ...l, direction: 'DEBIT' as const, currency: 'EUR' })),
            { accountId: 'balancing-account', direction: 'CREDIT' as const, amountCents: total, currency: 'EUR' },
          ];

          const service2 = new LedgerService(createFakePrisma());
          await service2.postEntry(lines);
          const result = await service2.verifyChain();
          return result.valid;
        }),
        { numRuns: 50 },
      );
    });

    it('global double-entry invariant: sum of all account balances is always zero', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              fromAccount: accountIdArb,
              toAccount: accountIdArb,
              amountCents: fc.integer({ min: 1, max: 10_000 }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (transfers) => {
            const service2 = new LedgerService(createFakePrisma());
            const touchedAccounts = new Set<string>();

            for (const t of transfers) {
              if (t.fromAccount === t.toAccount) continue;
              touchedAccounts.add(t.fromAccount);
              touchedAccounts.add(t.toAccount);
              await service2.postEntry([
                { accountId: t.fromAccount, direction: 'CREDIT', amountCents: t.amountCents, currency: 'EUR' },
                { accountId: t.toAccount, direction: 'DEBIT', amountCents: t.amountCents, currency: 'EUR' },
              ]);
            }

            let total = 0n;
            for (const accountId of touchedAccounts) {
              total += await service2.getAccountBalance(accountId);
            }

            return total === 0n;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('chain verification recomputes the same hash function used at write time', async () => {
      await fc.assert(
        fc.asyncProperty(lineArb, fc.constantFrom('balancer'), async (line, balancer) => {
          const fakePrisma = createFakePrisma();
          const service2 = new LedgerService(fakePrisma);
          const txId = await service2.postEntry([
            { accountId: line.accountId, direction: 'DEBIT', amountCents: line.amountCents, currency: 'EUR' },
            { accountId: balancer, direction: 'CREDIT', amountCents: line.amountCents, currency: 'EUR' },
          ]);

          const resolvedAccount = await fakePrisma.ledgerAccount.findFirst({
            where: { name: line.accountId, merchantId: null },
          });
          const expectedContent = [
            txId,
            resolvedAccount.id,
            'DEBIT',
            line.amountCents.toString(),
            'EUR',
            '',
          ].join('|');
          const expectedHash = createHash('sha256').update(GENESIS_HASH + expectedContent).digest('hex');

          const rows = await fakePrisma.journalEntry.findMany({});
          return rows[0].hash === expectedHash;
        }),
        { numRuns: 30 },
      );
    });
  });

  it('postConversion : conversion équilibrée par devise (2 jambes + comptes FX)', async () => {
    const txId = await service.postConversion({
      fromAccount: 'merchant-wallet-m1-EUR',
      toAccount: 'merchant-wallet-m1-XAF',
      amountFromCents: 1000n,
      currencyFrom: 'EUR',
      amountToCents: 655900n,
      currencyTo: 'XAF',
    });
    expect(typeof txId).toBe('string');
    // Soldes par devise (crédit - débit), sans mélange entre devises.
    expect(await service.getAccountBalance('merchant-wallet-m1-EUR')).toBe(-1000n);
    expect(await service.getAccountBalance('fx-exchange-EUR')).toBe(1000n);
    expect(await service.getAccountBalance('fx-exchange-XAF')).toBe(-655900n);
    expect(await service.getAccountBalance('merchant-wallet-m1-XAF')).toBe(655900n);
    // La chaîne reste intègre.
    expect((await service.verifyChain()).valid).toBe(true);
  });

  it('postConversion : refuse une conversion devise identique', async () => {
    await expect(
      service.postConversion({
        fromAccount: 'a', toAccount: 'b', amountFromCents: 100n, currencyFrom: 'EUR',
        amountToCents: 100n, currencyTo: 'EUR',
      }),
    ).rejects.toThrow(InvalidAmountError);
  });
});
