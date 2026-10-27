import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { existsSync } from 'fs';
import { join } from 'path';

export type QrFormat = 'A5' | 'A6';

export interface TillQrContent {
  merchantName: string;
  storeName: string;
  tillName: string;
  code: string;
  url: string;
}

const NAVY = '#0B1E3D';
const CYAN = '#00B4D8';
const MUTED = '#5B6B7F';

/**
 * Logos officiels des opérateurs : fichiers PNG fournis par AlphaPay dans
 * `assets/operators/` (droits d'usage via les contrats opérateur). À défaut,
 * un badge aux couleurs de l'opérateur avec son nom (D-047).
 */
const OPERATOR_BADGES = [
  { file: 'mtn.png', label: 'MTN MoMo', fill: '#FFCC00', text: '#000000' },
  { file: 'airtel.png', label: 'Airtel Money', fill: '#E40000', text: '#FFFFFF' },
];
const LOGO_DIR = join(__dirname, '..', '..', '..', 'assets', 'operators');

/** PDF imprimable du QR d'une caisse (T-54, §M4) : A5 ou A6, QR vectoriel. */
export async function renderTillQrPdf(content: TillQrContent, format: QrFormat): Promise<Buffer> {
  const doc = new PDFDocument({ size: format, margin: 0, info: { Title: `QR ${content.merchantName} - ${content.tillName}`, Author: 'AlphaPay' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const H = doc.page.height;
  const s = W / 297.64; // échelle : 1 en A6, ~1,41 en A5
  const m = 18 * s;

  // Bandeau AlphaPay.
  doc.rect(0, 0, W, 34 * s).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(14 * s).fillColor('#FFFFFF').text('Alpha', m, 10 * s, { continued: true }).fillColor(CYAN).text('Pay');

  // Marchand, boutique et caisse.
  let y = 48 * s;
  doc.font('Helvetica-Bold').fontSize(17 * s).fillColor(NAVY).text(content.merchantName, m, y, { width: W - 2 * m, align: 'center', height: 44 * s, ellipsis: true });
  y = doc.y + 2 * s;
  doc.font('Helvetica').fontSize(10 * s).fillColor(MUTED).text(`${content.storeName} · ${content.tillName}`, m, y, { width: W - 2 * m, align: 'center', lineBreak: false, ellipsis: true });

  // QR vectoriel, cadre cyan.
  const qr = QRCode.create(content.url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  // Marge claire d'au moins 3 modules entre le QR et le cadre (lecture fiable à l'impression).
  const outer = Math.min(W - 2 * m, H * 0.52);
  const cell = outer / (n + 6);
  const size = cell * n;
  const pad = 3 * cell;
  const qx = (W - size) / 2;
  const qy = y + 14 * s + pad;
  doc.roundedRect(qx - pad, qy - pad, size + 2 * pad, size + 2 * pad, 10 * s).lineWidth(3 * s).strokeColor(CYAN).stroke();
  doc.fillColor(NAVY);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) doc.rect(qx + c * cell, qy + r * cell, cell + 0.05, cell + 0.05);
    }
  }
  doc.fill();

  y = qy + size + pad + 10 * s;
  doc.font('Helvetica-Bold').fontSize(13 * s).fillColor(NAVY).text('Scannez pour payer', 0, y, { width: W, align: 'center' });
  y = doc.y + 2 * s;
  doc.font('Helvetica').fontSize(8.5 * s).fillColor(MUTED).text('avec votre Mobile Money', 0, y, { width: W, align: 'center' });

  // Opérateurs acceptés.
  y = doc.y + 8 * s;
  const bw = 78 * s;
  const bh = 22 * s;
  const gap = 10 * s;
  let bx = (W - (OPERATOR_BADGES.length * bw + (OPERATOR_BADGES.length - 1) * gap)) / 2;
  for (const op of OPERATOR_BADGES) {
    const logo = join(LOGO_DIR, op.file);
    if (existsSync(logo)) {
      doc.image(logo, bx, y, { fit: [bw, bh], align: 'center', valign: 'center' });
    } else {
      doc.roundedRect(bx, y, bw, bh, 5 * s).fill(op.fill);
      doc.font('Helvetica-Bold').fontSize(9 * s).fillColor(op.text).text(op.label, bx, y + (bh - 9 * s) / 2 + 1, { width: bw, align: 'center', lineBreak: false });
    }
    bx += bw + gap;
  }

  // Code caisse (secours si le QR ne se lit pas).
  doc.font('Courier-Bold').fontSize(9 * s).fillColor(NAVY).text(`Code caisse : ${content.code}`, 0, H - 30 * s, { width: W, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(7 * s).fillColor(MUTED).text(content.url, 0, H - 18 * s, { width: W, align: 'center', lineBreak: false, ellipsis: true });

  doc.end();
  return done;
}
