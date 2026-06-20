import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

export interface SettlementReceiptData {
  batchNumber: string;
  merchantId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  grossCents: bigint;
  commissionCents: bigint;
  holdsCents: bigint;
  netCents: bigint;
}

function money(cents: bigint, currency: string): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")} ${currency}`;
}

export function renderSettlementReceiptPdf(
  data: SettlementReceiptData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.rect(0, 0, doc.page.width, 105).fill("#0B3D5C");
    doc.fillColor("#FFFFFF").fontSize(24).text("PayBrain", 50, 30);
    doc.fontSize(12).text("Bordereau de settlement", 50, 68);
    doc
      .fillColor("#111827")
      .fontSize(11)
      .text(`Batch : ${data.batchNumber}`, 50, 135);
    doc.text(`Marchand : ${data.merchantId}`);
    doc.text(
      `Periode : ${data.periodStart.toISOString().slice(0, 10)} au ${data.periodEnd.toISOString().slice(0, 10)}`,
    );
    doc.moveDown(2);

    const rows: Array<[string, string]> = [
      ["Encaissements bruts", money(data.grossCents, data.currency)],
      ["Commissions", `- ${money(data.commissionCents, data.currency)}`],
      [
        "Retenues",
        data.holdsCents === 0n
          ? money(data.holdsCents, data.currency)
          : `- ${money(data.holdsCents, data.currency)}`,
      ],
      ["Net à reverser", money(data.netCents, data.currency)],
    ];
    for (const [label, value] of rows) {
      const y = doc.y;
      doc
        .rect(50, y, 495, 34)
        .fillAndStroke(
          label === "Net à reverser" ? "#DCEAF1" : "#F9FAFB",
          "#D1D5DB",
        );
      doc
        .fillColor("#111827")
        .fontSize(10)
        .text(label, 62, y + 11, { width: 250 });
      doc.text(value, 315, y + 11, { width: 215, align: "right" });
      doc.y = y + 40;
    }

    doc.moveDown(2);
    doc.x = 50;
    doc
      .fillColor("#4B5563")
      .fontSize(9)
      .text(
        "Document généré automatiquement. La référence externe du paiement sera ajoutée à l’audit du batch après émission.",
        { align: "center" },
      );
    doc
      .fillColor("#6B7280")
      .fontSize(8)
      .text(`PayBrain - ${data.batchNumber}`, 50, 780, {
        width: 495,
        align: "center",
      });
    doc.end();
  });
}

@Injectable()
export class SettlementReceiptService {
  private readonly s3 = new S3Client({
    region: process.env.AWS_REGION ?? "eu-west-1",
  });

  async archive(data: SettlementReceiptData): Promise<string | null> {
    const bucket =
      process.env.SETTLEMENT_DOCUMENTS_BUCKET ??
      process.env.RECONCILIATION_REPORTS_BUCKET;
    if (!bucket) return null;
    const key = `settlements/${data.batchNumber}/bordereau.pdf`;
    const retainUntil = new Date();
    retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + 5);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await renderSettlementReceiptPdf(data),
        ContentType: "application/pdf",
        ServerSideEncryption: "AES256",
        ObjectLockMode: "GOVERNANCE",
        ObjectLockRetainUntilDate: retainUntil,
      }),
    );
    return key;
  }
}
