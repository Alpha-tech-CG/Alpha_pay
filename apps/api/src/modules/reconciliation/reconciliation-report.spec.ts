import {
  ReconciliationReport,
  renderReconciliationPdf,
} from "./reconciliation-report.service";

const REPORT: ReconciliationReport = {
  operator: "MTN",
  statementDate: "2026-06-17",
  statementLines: 2,
  ledgerTransactions: 2,
  matchedCount: 1,
  discrepancyCount: 1,
  totalStatement: "250000",
  totalLedger: "240000",
  maxDiscrepancy: "10000",
  alert: false,
  discrepancies: [
    {
      type: "AMOUNT_MISMATCH",
      reference: "ref-001",
      ledgerAmount: "120000",
      statementAmount: "130000",
      details: "Montants divergents",
    },
  ],
};

describe("reconciliation PDF report (ALP-140)", () => {
  it("génère un PDF non vide avec une signature valide", async () => {
    const pdf = await renderReconciliationPdf(REPORT);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
