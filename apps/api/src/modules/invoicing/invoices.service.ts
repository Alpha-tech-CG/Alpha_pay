import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, InvoiceStatus } from '@paybrain/database';
import { FileStorage, fileStorageFromEnv } from '../../common/storage/file-storage';
import { toMajorAmount } from '../../common/money';

export interface InvoiceLineDto {
  description: string;
  quantity: number;
  unit_price: number; // en centimes
  tax_rate?: number;  // pourcentage ex: 18.00
  sort_order?: number;
}

export interface CreateInvoiceDto {
  customer_id?: string;
  currency?: string;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  footer?: string;
  lines: InvoiceLineDto[];
}

export interface InstallmentDto {
  due_date: string;
  amount: number; // centimes
}

const REMINDER_OFFSETS = [-3, 0, 3, 7]; // jours par rapport à l'échéance

@Injectable()
export class InvoicesService {
  private readonly storage: FileStorage = fileStorageFromEnv();

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  // ─── Clients ───────────────────────────────────────────────────────────────

  // ─── CRUD Facture ─────────────────────────────────────────────────────────

  async create(merchantId: string, livemode: boolean, dto: CreateInvoiceDto) {
    const { subtotal, taxAmount, total, lines } = this.computeAmounts(dto.lines);

    return this.prisma.invoice.create({
      data: {
        merchantId,
        livemode,
        customerId: dto.customer_id,
        currency: dto.currency ?? 'XAF',
        issueDate: dto.issue_date ? new Date(dto.issue_date) : new Date(),
        dueDate: dto.due_date ? new Date(dto.due_date) : undefined,
        notes: dto.notes,
        footer: dto.footer,
        subtotal,
        taxAmount,
        total,
        amountDue: total,
        lines: {
          create: lines,
        },
      },
      include: { lines: true, customer: true },
    });
  }

  list(merchantId: string, status?: string, cursor?: string, limit = 25) {
    const where: any = { merchantId };
    if (status) where.status = status.toUpperCase() as InvoiceStatus;
    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
  }

  async get(merchantId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true, installments: true },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');
    return inv;
  }

  async send(merchantId: string, invoiceId: string) {
    const inv = await this.get(merchantId, invoiceId);
    if (inv.status !== 'DRAFT') throw new BadRequestException('La facture ne peut être envoyée que depuis le statut DRAFT');

    const number = await this.nextNumber(merchantId);
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT', number },
    });
  }

  async void(merchantId: string, invoiceId: string) {
    const inv = await this.get(merchantId, invoiceId);
    if (inv.status === 'PAID') throw new BadRequestException('Une facture réglée ne peut pas être annulée');
    return this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } });
  }

  async recordPayment(invoiceId: string, amount: bigint) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId } });
    if (!inv) return;
    const newPaid = inv.amountPaid + amount;
    const newDue = inv.total - newPaid;
    const newStatus: InvoiceStatus = newDue <= 0n ? 'PAID' : 'PARTIAL';
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: newPaid, amountDue: newDue > 0n ? newDue : 0n, status: newStatus },
    });
  }

  // ─── Versements (T-75) ────────────────────────────────────────────────────

  async setInstallments(merchantId: string, invoiceId: string, installments: InstallmentDto[]) {
    const inv = await this.get(merchantId, invoiceId);
    const sumCheck = installments.reduce((s, i) => s + BigInt(i.amount), 0n);
    if (sumCheck !== inv.total) {
      throw new BadRequestException(`La somme des versements (${sumCheck}) doit être égale au total (${inv.total})`);
    }

    // Supprime les anciens versements et recrée
    await this.prisma.invoiceInstallment.deleteMany({ where: { invoiceId } });

    const created = await this.prisma.$transaction(
      installments.map((inst, idx) =>
        this.prisma.invoiceInstallment.create({
          data: {
            invoiceId,
            dueDate: new Date(inst.due_date),
            amount: BigInt(inst.amount),
          },
        }),
      ),
    );

    // Planifie les relances pour chaque versement
    await this.scheduleReminders(invoiceId, created);

    return created;
  }

  // ─── Relances (T-76) ──────────────────────────────────────────────────────

  async scheduleReminders(invoiceId: string, installments: any[]) {
    // Supprime les relances existantes non encore envoyées
    await this.prisma.invoiceReminder.deleteMany({
      where: { invoiceId, status: 'PENDING' },
    });

    const reminders: any[] = [];
    for (const inst of installments) {
      for (const offset of REMINDER_OFFSETS) {
        const dueMs = new Date(inst.dueDate).getTime();
        const scheduledFor = new Date(dueMs + offset * 86_400_000);
        // Restreint aux heures 8h-19h Africa/Brazzaville (UTC+1)
        const hour = scheduledFor.getUTCHours() + 1;
        if (hour < 8 || hour >= 19) {
          scheduledFor.setUTCHours(8, 0, 0, 0);
          if (hour >= 19) scheduledFor.setUTCDate(scheduledFor.getUTCDate() + 1);
        }
        reminders.push({
          invoiceId,
          installmentId: inst.id,
          channel: 'SMS',
          daysOffset: offset,
          scheduledFor,
        });
      }
    }

    await this.prisma.invoiceReminder.createMany({ data: reminders });
  }

  async sendDueReminders() {
    const now = new Date();
    const pending = await this.prisma.invoiceReminder.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: now } },
      include: { invoice: { include: { customer: true } } },
      take: 100,
    });

    for (const rem of pending) {
      try {
        // Vérifie que la facture n'est pas déjà payée
        if (rem.invoice.status === 'PAID' || rem.invoice.status === 'VOID') {
          await this.prisma.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'SKIPPED' } });
          continue;
        }
        // TODO : appel MessagingService pour envoi SMS/WhatsApp/email
        await this.prisma.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'SENT', sentAt: new Date() } });
      } catch (err: any) {
        await this.prisma.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'FAILED', error: String(err?.message) } });
      }
    }
  }

  // ─── PDF (T-74) ───────────────────────────────────────────────────────────

  async generatePdf(merchantId: string, invoiceId: string): Promise<string> {
    const inv = await this.get(merchantId, invoiceId);

    // Génération HTML simple (pas de dépendance puppeteer en V1 ; le PDF sera
    // généré via un endpoint séparé ou une tâche de fond selon la décision D-054).
    const html = this.renderHtml(inv);
    const buf = Buffer.from(html, 'utf8');
    const fileKey = `invoices/${merchantId}/${invoiceId}.html`;
    await this.storage.put(fileKey, buf);

    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { pdfKey: fileKey } });
    return fileKey;
  }

  // ─── Reçus (T-77) ─────────────────────────────────────────────────────────

  async createReceipt(merchantId: string, invoiceId: string, amount: bigint, livemode: boolean) {
    const number = await this.nextReceiptNumber(merchantId);
    return this.prisma.receipt.create({
      data: { merchantId, invoiceId, number, amount, livemode },
    });
  }

  listReceipts(merchantId: string) {
    return this.prisma.receipt.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private computeAmounts(dtoLines: InvoiceLineDto[]) {
    let subtotal = 0n;
    let taxAmount = 0n;
    const lines = dtoLines.map((l, idx) => {
      const qty = Math.round(l.quantity * 1000); // Decimal(10,3) en bigint
      const lineAmount = BigInt(Math.round(l.quantity * l.unit_price));
      const lineTax = BigInt(Math.round(Number(lineAmount) * (l.tax_rate ?? 0) / 100));
      subtotal += lineAmount;
      taxAmount += lineTax;
      return {
        description: l.description,
        quantity: l.quantity,
        unitPrice: BigInt(l.unit_price),
        taxRate: l.tax_rate ?? 0,
        amount: lineAmount,
        sortOrder: l.sort_order ?? idx,
      };
    });
    return { subtotal, taxAmount, total: subtotal + taxAmount, lines };
  }

  private async nextNumber(merchantId: string): Promise<string> {
    // Incrémente le compteur en transaction pour garantir l'unicité
    const counter = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO invoice_counters (merchant_id, last_seq)
        VALUES (${merchantId}::uuid, 1)
        ON CONFLICT (merchant_id) DO UPDATE SET last_seq = invoice_counters.last_seq + 1
      `;
      const row = await tx.invoiceCounter.findUnique({ where: { merchantId } });
      return row!.lastSeq;
    });
    const year = new Date().getFullYear();
    return `INV-${year}-${String(counter).padStart(5, '0')}`;
  }

  private async nextReceiptNumber(merchantId: string): Promise<string> {
    // Réutilise le même compteur avec un préfixe différent
    const counter = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO invoice_counters (merchant_id, last_seq)
        VALUES (${merchantId}::uuid, 1)
        ON CONFLICT (merchant_id) DO UPDATE SET last_seq = invoice_counters.last_seq + 1
      `;
      const row = await tx.invoiceCounter.findUnique({ where: { merchantId } });
      return row!.lastSeq;
    });
    const year = new Date().getFullYear();
    return `REC-${year}-${String(counter).padStart(5, '0')}`;
  }

  private renderHtml(inv: any): string {
    const lines = (inv.lines ?? []).map((l: any) =>
      `<tr><td>${l.description}</td><td>${l.quantity}</td><td>${toMajorAmount(l.unitPrice, inv.currency)}</td><td>${toMajorAmount(l.amount, inv.currency)}</td></tr>`,
    ).join('');
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${inv.number ?? inv.id}</title></head>
<body>
<h1>Facture ${inv.number ?? '(brouillon)'}</h1>
<p>Client : ${inv.customer?.name ?? '—'}</p>
<p>Date : ${inv.issueDate?.toISOString?.().slice(0, 10) ?? ''}</p>
<table><thead><tr><th>Description</th><th>Qté</th><th>PU</th><th>Montant</th></tr></thead>
<tbody>${lines}</tbody></table>
<p><strong>Total : ${toMajorAmount(inv.total, inv.currency)} ${inv.currency}</strong></p>
${inv.notes ? `<p>${inv.notes}</p>` : ''}
</body></html>`;
  }
}
