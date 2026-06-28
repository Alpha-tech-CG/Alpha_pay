import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { SettlementService } from "./settlement.service";
import { encryptField } from "../../common/security/pii-crypto";

function deps(overrides: any = {}) {
  const batches: Record<string, any> = {};
  const defaultConfig = {
    commissionBps: 150,
    minAmountCents: 0n,
    payoutMethod: "MOMO",
    payoutProvider: "mtn",
    payoutDestinationEncrypted: encryptField("+242061234567"),
  };
  const prisma = {
    merchantSettlementConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.config ?? defaultConfig),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue(overrides.txns ?? []),
    },
    settlementBatch: {
      create: jest.fn(async ({ data }: any) => {
        const b = { id: "b1", ...data, validatedBy: data.validatedBy ?? [] };
        batches[b.id] = b;
        return b;
      }),
      findUnique: jest.fn(
        async ({ where }: any) => batches[where.id] ?? overrides.batch ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        batches[where.id] = {
          ...(batches[where.id] ?? overrides.batch),
          ...data,
        };
        return batches[where.id];
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const b = batches[where.id] ?? overrides.batch;
        if (!b) return { count: 0 };
        const curV = b.version ?? 0;
        const wantV = where.version ?? 0;
        if (curV !== wantV) return { count: 0 };
        if (where.status && b.status !== where.status) return { count: 0 };
        const excluded = where.NOT?.validatedBy?.has;
        if (excluded && (b.validatedBy ?? []).includes(excluded)) return { count: 0 };
        batches[where.id] = {
          ...b,
          ...data,
          version: curV + 1,
        };
        return { count: 1 };
      }),
    },
    settlementAudit: { create: jest.fn().mockResolvedValue({}) },
    merchant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ emailEncrypted: encryptField("m@paybrain.cg") }),
    },
  };
  const ledger = {
    postEntry: jest.fn().mockResolvedValue("tx"),
    postConversion: jest.fn().mockResolvedValue("fx-tx"),
  };
  const currency = {
    convert: jest.fn(async (amount: number, from: string, to: string) => ({
      from, to, rate: 655.957, amount,
      convertedAmount: Math.round(amount * 655.957),
      formatted: '',
    })),
  };
  const notifications = { send: jest.fn().mockResolvedValue({ ok: true }) };
  const webhooks = { dispatch: jest.fn().mockResolvedValue(0) };
  const payout = {
    send: jest
      .fn()
      .mockResolvedValue({
        externalReference: "pay-1",
        provider: "mtn",
        status: "ACCEPTED",
      }),
  };
  const receipts = {
    archive: jest.fn().mockResolvedValue("settlements/STL-1/bordereau.pdf"),
  };
  const svc = new SettlementService(
    prisma as any,
    ledger as any,
    notifications as any,
    webhooks as any,
    payout as any,
    receipts as any,
    currency as any,
  );
  return {
    svc,
    prisma,
    ledger,
    currency,
    notifications,
    webhooks,
    payout,
    receipts,
    batches,
  };
}

const P0 = new Date("2026-06-01");
const P1 = new Date("2026-06-02");

describe("SettlementService (ALP-141)", () => {
  it("calcule le net (gross − commission 1.5%) et trace au ledger", async () => {
    const { svc, ledger } = deps({
      txns: [
        { amount: 100000n, currency: "XAF" },
        { amount: 100000n, currency: "XAF" },
      ],
    });
    const res = await svc.run("m1", P0, P1);
    // gross 200000, commission 1.5% = 3000, net = 197000
    expect(res).toMatchObject({
      created: true,
      netCents: "197000",
      status: "INITIATED",
    });
    expect(ledger.postEntry).toHaveBeenCalled();
  });

  it("ne crée pas de batch si net < seuil minimum", async () => {
    const { svc } = deps({
      txns: [{ amount: 1000n, currency: "XAF" }],
      config: { commissionBps: 150, minAmountCents: 999999n },
    });
    const res = await svc.run("m1", P0, P1);
    expect(res.created).toBe(false);
  });

  it("exige une double validation au-dessus du seuil", async () => {
    const { svc } = deps({ txns: [{ amount: 60_000_000n, currency: "XAF" }] }); // net > 500k FCFA
    const res: any = await svc.run("m1", P0, P1);
    expect(res.requiresDoubleValidation).toBe(true);
    expect(res.status).toBe("PENDING_VALIDATION");
  });

  it("4-eyes : refuse le même validateur deux fois, passe INITIATED avec 2 distincts", async () => {
    const { svc, batches } = deps();
    batches["bX"] = {
      id: "bX",
      status: "PENDING_VALIDATION",
      requiresDoubleValidation: true,
      validatedBy: [],
    };
    const r1 = await svc.validate("bX", "alice");
    expect(r1.status).toBe("PENDING_VALIDATION");
    await expect(svc.validate("bX", "alice")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const r2 = await svc.validate("bX", "bob");
    expect(r2.status).toBe("INITIATED");
  });

  it("flux send -> SENT puis confirm -> CONFIRMED + notifie le marchand", async () => {
    const { svc, batches, notifications, webhooks } = deps();
    batches["bS"] = {
      id: "bS",
      status: "INITIATED",
      netCents: 197000n,
      currency: "XAF",
      batchNumber: "STL-1",
      merchantId: "m1",
    };
    const sent = await svc.send("bS");
    expect(sent).toMatchObject({ status: "SENT", externalReference: "pay-1" });
    const confirmed = await svc.confirm("bS");
    expect(confirmed.status).toBe("CONFIRMED");
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "m@paybrain.cg" }),
    );
    expect(webhooks.dispatch).toHaveBeenCalled();
  });

  it("marque FAILED si le fournisseur de payout rejette l’ordre", async () => {
    const { svc, batches, payout } = deps();
    batches["bF"] = {
      id: "bF",
      status: "INITIATED",
      netCents: 197000n,
      currency: "XAF",
      batchNumber: "STL-F",
      merchantId: "m1",
    };
    payout.send.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(svc.send("bF")).rejects.toBeInstanceOf(BadRequestException);
    expect(batches["bF"]).toMatchObject({
      status: "FAILED",
      failureReason: "provider unavailable",
    });
  });

  it("confirm refuse un batch non envoyé", async () => {
    const { svc, batches } = deps();
    batches["bI"] = { id: "bI", status: "INITIATED" };
    await expect(svc.confirm("bI")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("FX : convertit le net et écrit la conversion si la devise de settlement diffère (ALP-151)", async () => {
    const { svc, ledger, currency } = deps({
      txns: [{ amount: 100000n, currency: "EUR" }], // 1000 EUR encaissés
      config: {
        commissionBps: 0, minAmountCents: 0n, payoutMethod: "MOMO", payoutProvider: "mtn",
        payoutDestinationEncrypted: encryptField("+242066123456"), settlementCurrency: "XAF",
      },
    });
    const res: any = await svc.run("m1", P0, P1);
    expect(currency.convert).toHaveBeenCalledWith(1000, "EUR", "XAF");
    expect(ledger.postConversion).toHaveBeenCalledWith(
      expect.objectContaining({ currencyFrom: "EUR", currencyTo: "XAF" }),
    );
    expect(res).toMatchObject({ currency: "EUR", settlementCurrency: "XAF" });
  });

  it("sans devise de settlement distincte : pas de conversion FX", async () => {
    const { svc, ledger, currency } = deps({ txns: [{ amount: 100000n, currency: "XAF" }] });
    await svc.run("m1", P0, P1);
    expect(currency.convert).not.toHaveBeenCalled();
    expect(ledger.postConversion).not.toHaveBeenCalled();
  });
});
