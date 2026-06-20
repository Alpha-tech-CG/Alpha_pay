import { renderSettlementReceiptPdf } from "./settlement-receipt.service";

describe("settlement receipt PDF (ALP-141)", () => {
  it("génère un bordereau PDF valide", async () => {
    const pdf = await renderSettlementReceiptPdf({
      batchNumber: "STL-20260619-ABC",
      merchantId: "merchant-1",
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-02"),
      currency: "XAF",
      grossCents: 200000n,
      commissionCents: 3000n,
      holdsCents: 0n,
      netCents: 197000n,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
