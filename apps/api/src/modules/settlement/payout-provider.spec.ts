jest.mock("@paybrain/connectors", () => ({
  createMtnConnector: jest.fn(() => ({
    disburse: jest.fn(async () => ({ referenceId: "mtn-ref", status: "PENDING", operator: "MTN" })),
  })),
  createAirtelConnector: jest.fn(() => ({
    disburse: jest.fn(async () => ({ referenceId: "air-ref", status: "PENDING", operator: "AIRTEL" })),
  })),
}));

import { PayoutProviderService } from "./payout-provider.service";

describe("PayoutProviderService (ALP-141)", () => {
  const oldEnv = process.env;
  const oldFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...oldEnv, PAYOUT_API_URL: "https://payout.test", PAYOUT_API_TOKEN: "token" };
    global.fetch = jest.fn() as any;
  });
  afterEach(() => {
    process.env = oldEnv;
    global.fetch = oldFetch;
  });

  it("BANK : émet un transfert idempotent via le fournisseur générique", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "transfer-1", status: "accepted" }),
    });
    const result = await new PayoutProviderService().send({
      batchNumber: "STL-1", amountCents: 125000n, currency: "XAF",
      method: "BANK", provider: "bank", destination: "CG-IBAN-001",
    });
    expect(result.externalReference).toBe("transfer-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://payout.test/transfers",
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "STL-1" }) }),
    );
  });

  it("MOMO : route un numéro MTN vers le Disbursement MTN", async () => {
    const result = await new PayoutProviderService().send({
      batchNumber: "STL-2", amountCents: 100000n, currency: "XAF",
      method: "MOMO", provider: "momo", destination: "+242066123456",
    });
    expect(result).toMatchObject({ provider: "MTN", externalReference: "mtn-ref", status: "PENDING" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("MOMO : route un numéro Airtel vers le Disbursement Airtel", async () => {
    const result = await new PayoutProviderService().send({
      batchNumber: "STL-3", amountCents: 100000n, currency: "XAF",
      method: "MOMO", provider: "momo", destination: "+242055123456",
    });
    expect(result).toMatchObject({ provider: "AIRTEL", externalReference: "air-ref" });
  });

  it("BANK : refuse sans configuration fournisseur", async () => {
    delete process.env.PAYOUT_API_URL;
    await expect(
      new PayoutProviderService().send({
        batchNumber: "STL-4", amountCents: 100n, currency: "XAF",
        method: "BANK", provider: "bank", destination: "CG001",
      }),
    ).rejects.toThrow("non configurés");
  });
});
