import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client } from "../../common/storage/s3-client";
import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

export interface ReconciliationReport {
  operator: string;
  statementDate: string;
  statementLines: number;
  ledgerTransactions: number;
  matchedCount: number;
  discrepancyCount: number;
  totalStatement: string;
  totalLedger: string;
  maxDiscrepancy: string;
  alert: boolean;
  discrepancies: Array<{
    type: string;
    reference: string;
    ledgerAmount: string | null;
    statementAmount: string | null;
    details?: string;
  }>;
}

function formatCents(value: string | null): string {
  if (value === null) return "-";
  const cents = BigInt(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")} XAF`;
}

export function renderReconciliationPdf(
  report: ReconciliationReport,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.rect(0, 0, doc.page.width, 92).fill("#0B3D5C");
    doc.fillColor("#FFFFFF").fontSize(22).text("PayBrain", 40, 28);
    doc.fontSize(12).text("Rapport de reconciliation", 40, 58);
    doc.fillColor("#1F2937");

    doc.moveDown(3.5);
    doc.fontSize(11).text(`Operateur : ${report.operator}`);
    doc.text(`Date du releve : ${report.statementDate}`);
    doc.text(`Statut : ${report.alert ? "ALERTE P1" : "CONTROLE"}`);
    doc.moveDown();

    const metrics = [
      ["Lignes releve", report.statementLines],
      ["Transactions ledger", report.ledgerTransactions],
      ["Rapprochees", report.matchedCount],
      ["Ecarts", report.discrepancyCount],
    ] as const;
    const boxWidth = 122;
    const boxY = doc.y;
    metrics.forEach(([label, value], index) => {
      const x = 40 + index * (boxWidth + 8);
      doc
        .roundedRect(x, boxY, boxWidth, 52, 4)
        .fillAndStroke("#F3F4F6", "#D1D5DB");
      doc
        .fillColor("#0B3D5C")
        .fontSize(17)
        .text(String(value), x + 8, boxY + 8, {
          width: boxWidth - 16,
          align: "center",
        });
      doc
        .fillColor("#4B5563")
        .fontSize(8)
        .text(label, x + 8, boxY + 32, {
          width: boxWidth - 16,
          align: "center",
        });
    });
    doc.x = 40;
    doc.y = boxY + 68;

    doc
      .fillColor("#111827")
      .fontSize(12)
      .text("Synthese financiere", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9);
    doc.text(`Total releve : ${formatCents(report.totalStatement)}`);
    doc.text(`Total ledger : ${formatCents(report.totalLedger)}`);
    doc.text(`Ecart maximal : ${formatCents(report.maxDiscrepancy)}`);
    doc.moveDown();

    doc.fontSize(12).text("Ecarts detectes", { underline: true });
    doc.moveDown(0.5);
    if (report.discrepancies.length === 0) {
      doc.fillColor("#166534").fontSize(10).text("Aucun ecart detecte.");
    } else {
      const drawHeader = () => {
        const y = doc.y;
        doc.rect(40, y, 515, 20).fill("#DCEAF1");
        doc.fillColor("#0B3D5C").fontSize(8);
        doc.text("Type", 44, y + 6, { width: 110 });
        doc.text("Reference", 157, y + 6, { width: 115 });
        doc.text("Ledger", 275, y + 6, { width: 85, align: "right" });
        doc.text("Releve", 363, y + 6, { width: 85, align: "right" });
        doc.text("Details", 452, y + 6, { width: 98 });
        doc.y = y + 24;
      };
      drawHeader();
      for (const item of report.discrepancies) {
        if (doc.y > 735) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        doc.fillColor("#111827").fontSize(7);
        doc.text(item.type, 44, y, { width: 110 });
        doc.text(item.reference, 157, y, { width: 115 });
        doc.text(formatCents(item.ledgerAmount), 275, y, {
          width: 85,
          align: "right",
        });
        doc.text(formatCents(item.statementAmount), 363, y, {
          width: 85,
          align: "right",
        });
        doc.text(item.details ?? "-", 452, y, { width: 98 });
        doc
          .moveTo(40, y + 24)
          .lineTo(555, y + 24)
          .strokeColor("#E5E7EB")
          .stroke();
        doc.y = y + 29;
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fillColor("#6B7280")
        .fontSize(8)
        .text(
          `PayBrain - ${report.operator} ${report.statementDate} - Page ${i + 1}/${range.count}`,
          40,
          780,
          { width: 515, align: "center" },
        );
    }
    doc.end();
  });
}

@Injectable()
export class ReconciliationReportService {
  private readonly s3 = createS3Client("eu-west-1");

  async archive(runId: string, report: ReconciliationReport) {
    const bucket = process.env.RECONCILIATION_REPORTS_BUCKET;
    if (!bucket) return null;

    const prefix = `${report.operator}/${report.statementDate}/${runId}`;
    const jsonKey = `${prefix}/report.json`;
    const pdfKey = `${prefix}/report.pdf`;
    const retainUntil = new Date();
    retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + 5);
    const common = {
      Bucket: bucket,
      ObjectLockMode: "GOVERNANCE" as const,
      ObjectLockRetainUntilDate: retainUntil,
      ServerSideEncryption: "AES256" as const,
    };

    await Promise.all([
      this.s3.send(
        new PutObjectCommand({
          ...common,
          Key: jsonKey,
          Body: JSON.stringify(report),
          ContentType: "application/json",
        }),
      ),
      this.s3.send(
        new PutObjectCommand({
          ...common,
          Key: pdfKey,
          Body: await renderReconciliationPdf(report),
          ContentType: "application/pdf",
        }),
      ),
    ]);
    return { jsonKey, pdfKey };
  }
}
