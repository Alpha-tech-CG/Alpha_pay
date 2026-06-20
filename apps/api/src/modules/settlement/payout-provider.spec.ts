import { PayoutProviderService } from "./payout-provider.service";

describe("PayoutProviderService (ALP-141)", () => {
  const oldEnv = process.env;
  const oldFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      PAYOUT_API_URL: "https://payout.test",
      PAYOUT_API_TOKEN: "token",
    };
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    process.env = oldEnv;
    global.fetch = oldFetch;
  });

  it("émet un transfert idempotent et conserve la référence fournisseur", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "transfer-1", status: "accepted" }),
    });
    const result = await new PayoutProviderService().send({
      batchNumber: "STL-1",
      amountCents: 125000n,
      currency: "XAF",
      method: "MOMO",
      provider: "mtn",
      destination: "+242061234567",
    });
    expect(result.externalReference).toBe("transfer-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://payout.test/transfers",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "STL-1" }),
      }),
    );
  });

  it("refuse de simuler un payout sans configuration fournisseur", async () => {
    delete process.env.PAYOUT_API_URL;
    await expect(
      new PayoutProviderService().send({
        batchNumber: "STL-2",
        amountCents: 100n,
        currency: "XAF",
        method: "BANK",
        provider: "bank",
        destination: "CG001",
      }),
    ).rejects.toThrow("non configurés");
  });
});
