import PDFDocument from 'pdfkit';
import { formatAmount } from '../../common/money';

const NAVY = '#0B1E3D';
const CYAN = '#00B4D8';
const MUTED = '#5B6B7F';
const LINE = '#DCE3EC';

/** Les polices standard PDF ne connaissent pas les espaces fines insécables du format fr-FR. */
function txt(value: string): string {
  return value.replace(/[  ]/g, ' ');
}

function money(minor: bigint, currency: string): string {
  return txt(formatAmount(minor, currency));
}

function date(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Brazzaville' }) : '—';
}

function render(build: (doc: PDFKit.PDFDocument) => void, title: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Author: 'AlphaPay' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  build(doc);
  doc.end();
  return done;
}

function header(doc: PDFKit.PDFDocument, merchantName: string, kind: string, number: string, livemode: boolean) {
  const W = doc.page.width;
  doc.rect(0, 0, W, 6).fill(CYAN);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(txt(merchantName), 48, 36, { width: W / 2 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text(kind, W / 2, 36, { width: W / 2 - 48, align: 'right' });
  doc.font('Courier-Bold').fontSize(11).fillColor(MUTED).text(number, W / 2, 62, { width: W / 2 - 48, align: 'right' });
  if (!livemode) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#B45309').text('DOCUMENT DE TEST — SANS VALEUR', W / 2, 78, { width: W / 2 - 48, align: 'right' });
  }
  doc.moveTo(48, 100).lineTo(W - 48, 100).lineWidth(1).strokeColor(LINE).stroke();
  doc.y = 112;
}

function footer(doc: PDFKit.PDFDocument) {
  const W = doc.page.width;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
    'Document émis via AlphaPay, plateforme de gestion des encaissements. Le paiement est reçu directement sur le compte Mobile Money du marchand.',
    48,
    doc.page.height - 70,
    { width: W - 96, align: 'center' },
  );
}

function infoRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, 48, y, { width: 140 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(txt(value), 190, y, { width: doc.page.width - 238 });
  doc.moveDown(0.3);
}

export interface InvoicePdf {
  merchantName: string;
  livemode: boolean;
  number: string | null;
  status: string;
  currency: string;
  issueDate: Date;
  dueDate: Date | null;
  customer: { name: string; phone?: string | null; email?: string | null } | null;
  student?: { name: string; className?: string | null; year?: string | null } | null;
  lines: { description: string; quantity: string; unitPrice: bigint; amount: bigint }[];
  subtotal: bigint;
  taxAmount: bigint;
  total: bigint;
  amountPaid: bigint;
  amountDue: bigint;
  installments: { label: string; dueDate: Date; amount: bigint; status: string }[];
  paymentUrl: string | null;
  notes: string | null;
}

/** Facture PDF (§M7) : lignes, total, échéancier et lien de paiement. */
export function renderInvoicePdf(inv: InvoicePdf): Promise<Buffer> {
  return render((doc) => {
    const W = doc.page.width;
    header(doc, inv.merchantName, 'FACTURE', inv.number ?? 'BROUILLON', inv.livemode);
    if (inv.customer) infoRow(doc, 'Client', inv.customer.name);
    if (inv.student) infoRow(doc, 'Élève', [inv.student.name, inv.student.className, inv.student.year].filter(Boolean).join(' · '));
    infoRow(doc, 'Date', date(inv.issueDate));
    infoRow(doc, 'Échéance', date(inv.dueDate));
    infoRow(doc, 'Statut', inv.status);
    doc.moveDown(1);

    // Lignes.
    const cols = [48, 300, 360, 460];
    const head = doc.y;
    doc.rect(48, head - 4, W - 96, 20).fill('#F1F5F9');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY);
    doc.text('Description', cols[0] + 6, head, { width: 240 });
    doc.text('Qté', cols[1], head, { width: 50, align: 'right' });
    doc.text('Prix unitaire', cols[2], head, { width: 90, align: 'right' });
    doc.text('Montant', cols[3], head, { width: W - 48 - cols[3] - 6, align: 'right' });
    doc.y = head + 22;
    for (const l of inv.lines) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(txt(l.description), cols[0] + 6, y, { width: 240 });
      const rowEnd = doc.y;
      doc.text(l.quantity, cols[1], y, { width: 50, align: 'right' });
      doc.text(money(l.unitPrice, inv.currency), cols[2], y, { width: 90, align: 'right' });
      doc.text(money(l.amount, inv.currency), cols[3], y, { width: W - 48 - cols[3] - 6, align: 'right' });
      doc.y = Math.max(rowEnd, doc.y) + 4;
      doc.moveTo(48, doc.y).lineTo(W - 48, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.y += 6;
    }

    // Totaux.
    const total = (label: string, value: bigint, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(NAVY);
      doc.text(label, 330, y, { width: 120, align: 'right' });
      doc.text(money(value, inv.currency), 460, y, { width: W - 48 - 466, align: 'right' });
      doc.moveDown(0.4);
    };
    doc.moveDown(0.5);
    if (inv.taxAmount > 0n) {
      total('Sous-total', inv.subtotal);
      total('Taxes', inv.taxAmount);
    }
    total('Total', inv.total, true);
    if (inv.amountPaid > 0n) {
      total('Déjà payé', inv.amountPaid);
      total('Reste à payer', inv.amountDue, true);
    }

    if (inv.installments.length > 0) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Échéancier', 48);
      doc.moveDown(0.3);
      for (const i of inv.installments) {
        const y = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(`${txt(i.label)} — ${date(i.dueDate)}`, 48, y, { width: 300 });
        doc.text(`${money(i.amount, inv.currency)} · ${i.status}`, 330, y, { width: W - 48 - 330, align: 'right' });
        doc.moveDown(0.3);
      }
    }

    if (inv.paymentUrl) {
      doc.moveDown(1.2);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Payer par MTN MoMo ou Airtel Money', 48);
      doc.font('Helvetica').fontSize(10).fillColor(CYAN).text(inv.paymentUrl, 48, doc.y + 2, { link: inv.paymentUrl, underline: true });
    }
    if (inv.notes) {
      doc.moveDown(1.2);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(txt(inv.notes), 48, doc.y, { width: W - 96 });
    }
    footer(doc);
  }, `Facture ${inv.number ?? 'brouillon'}`);
}

export interface ReceiptPdf {
  merchantName: string;
  livemode: boolean;
  number: string;
  paidAt: Date;
  amount: bigint;
  currency: string;
  operator: string;
  reference: string;
  payerName: string | null;
  payerPhoneMask: string | null;
  description: string | null;
  invoiceNumber: string | null;
  student?: { name: string; className?: string | null; year?: string | null } | null;
}

/** Reçu PDF (§M7, §M8) : numéroté sans trou, au nom de l'élève pour une école. */
export function renderReceiptPdf(r: ReceiptPdf): Promise<Buffer> {
  return render((doc) => {
    const W = doc.page.width;
    header(doc, r.merchantName, 'REÇU', r.number, r.livemode);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('Montant reçu', 48);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(NAVY).text(money(r.amount, r.currency), 48);
    doc.moveDown(0.8);
    infoRow(doc, 'Date du paiement', r.paidAt.toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' }));
    infoRow(doc, 'Moyen de paiement', r.operator);
    infoRow(doc, 'Référence', r.reference);
    if (r.payerName) infoRow(doc, 'Payé par', r.payerName);
    if (r.payerPhoneMask) infoRow(doc, 'Numéro', r.payerPhoneMask);
    if (r.student) {
      infoRow(doc, 'Élève', r.student.name);
      if (r.student.className) infoRow(doc, 'Classe', r.student.className);
      if (r.student.year) infoRow(doc, 'Année scolaire', r.student.year);
    }
    if (r.invoiceNumber) infoRow(doc, 'Facture', r.invoiceNumber);
    if (r.description) infoRow(doc, 'Objet', r.description);
    doc.moveDown(1);
    doc.moveTo(48, doc.y).lineTo(W - 48, doc.y).lineWidth(1).strokeColor(LINE).stroke();
    footer(doc);
  }, `Reçu ${r.number}`);
}
