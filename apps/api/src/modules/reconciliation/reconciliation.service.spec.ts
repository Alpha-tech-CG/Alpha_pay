import { ReconciliationService } from "./reconciliation.service";
import { StatementLine } from "./statement-parser";

function line(reference: string, amountCents: bigint): StatementLine {
  return { reference, amountCents, date: "2026-06-17", raw: {} };
}

function createPrisma(txns: any[]) {
  const created: any[] = [];
  return {
    created,
    transaction: { findMany: jest.fn().mockResolvedValue(txns) },
    reconciliationRun: {
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return { id: "run-1", ...data };
      }),
    },
  };
}

const DATE = new Date("2026-06-17");

describe("ReconciliationService.reconcile (ALP-140)", () => {
  it("rapproche les lignes correspondantes (0 écart)", async () => {
    const prisma = createPrisma([
      {
        id: "t1",
        mtnReferenceId: "ref-1",
        externalId: "ext-1",
        amount: 10000n,
      },
    ]);
    const svc = new ReconciliationService(
      prisma as any,
      { send: jest.fn().mockResolvedValue({ ok: true }) } as any,
    );
    const res = await svc.reconcile("MTN", [line("ref-1", 10000n)], DATE);
    expect(res.discrepancyCount).toBe(0);
    expect(res.matchedCount).toBe(1);
    expect(res.alert).toBe(false);
  });

  it("détecte STATEMENT_NOT_IN_LEDGER", async () => {
    const prisma = createPrisma([]);
    const svc = new ReconciliationService(
      prisma as any,
      { send: jest.fn().mockResolvedValue({ ok: true }) } as any,
    );
    const res = await svc.reconcile("MTN", [line("inconnu", 5000n)], DATE);
    expect(
      res.discrepancies.some((d) => d.type === "STATEMENT_NOT_IN_LEDGER"),
    ).toBe(true);
  });

  it("détecte LEDGER_NOT_IN_STATEMENT", async () => {
    const prisma = createPrisma([
      {
        id: "t1",
        mtnReferenceId: "ref-1",
        externalId: "ext-1",
        amount: 10000n,
      },
    ]);
    const svc = new ReconciliationService(
      prisma as any,
      { send: jest.fn().mockResolvedValue({ ok: true }) } as any,
    );
    const res = await svc.reconcile("MTN", [], DATE);
    expect(
      res.discrepancies.some((d) => d.type === "LEDGER_NOT_IN_STATEMENT"),
    ).toBe(true);
  });

  it("détecte AMOUNT_MISMATCH", async () => {
    const prisma = createPrisma([
      {
        id: "t1",
        mtnReferenceId: "ref-1",
        externalId: "ext-1",
        amount: 10000n,
      },
    ]);
    const svc = new ReconciliationService(
      prisma as any,
      { send: jest.fn().mockResolvedValue({ ok: true }) } as any,
    );
    const res = await svc.reconcile("MTN", [line("ref-1", 9000n)], DATE);
    expect(res.discrepancies.some((d) => d.type === "AMOUNT_MISMATCH")).toBe(
      true,
    );
  });

  it("détecte les DUPLICATE dans le relevé", async () => {
    const prisma = createPrisma([
      {
        id: "t1",
        mtnReferenceId: "ref-1",
        externalId: "ext-1",
        amount: 10000n,
      },
    ]);
    const svc = new ReconciliationService(
      prisma as any,
      { send: jest.fn().mockResolvedValue({ ok: true }) } as any,
    );
    const res = await svc.reconcile(
      "MTN",
      [line("ref-1", 10000n), line("ref-1", 10000n)],
      DATE,
    );
    expect(res.discrepancies.some((d) => d.type === "DUPLICATE")).toBe(true);
  });

  it("lève une alerte P1 si écart > 100 000 FCFA", async () => {
    // Transaction ledger absente du relevé, montant 200 000 FCFA = 20 000 000 centimes.
    const prisma = createPrisma([
      {
        id: "t1",
        mtnReferenceId: "ref-1",
        externalId: "ext-1",
        amount: 20_000_000n,
      },
    ]);
    const svc = new ReconciliationService(
      prisma as any,
      { send: jest.fn().mockResolvedValue({ ok: true }) } as any,
    );
    const res = await svc.reconcile("MTN", [], DATE);
    expect(res.alert).toBe(true);
  });
});
