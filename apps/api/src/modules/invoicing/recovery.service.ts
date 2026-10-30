import { HttpStatus, Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ANY_MODE, Prisma, PrismaClient, Receipt, Transaction } from '@paybrain/database';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount } from '../../common/money';
import { afterCursor, decodeCursor, page } from '../../common/pagination/cursor';
import { PaymentHooks } from '../../common/payments/payment-hooks';
import { decryptField } from '../../common/security/pii-crypto';
import { MessagingService } from '../messaging/messaging.service';
import { publicDocumentUrl } from '../providers/callback-token';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';
import { nextDocumentNumber } from './document-numbers';
import { renderReceiptPdf } from './documents.pdf';
import { reachableChannels } from './invoices.service';

const OPERATOR_LABEL: Record<string, string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', CARD: 'Carte bancaire' };

interface Applied {
  receipt: Receipt;
  invoice: { id: string; number: string | null; status: string; total: bigint; amountPaid: bigint; amountDue: bigint; currency: string; customerId: string | null } | null;
  installment: { id: string; position: number; amount: bigint; status: string } | null;
  invoicePaidNow: boolean;
}

/**
 * Effets d'un paiement réussi pour le recouvrement (§M7) : reçu numéroté sans
 * trou, facture ou versement mis à jour, relances arrêtées, échéancier élève
 * (§M8) soldé, reçu envoyé au client, webhooks `invoice.paid` et
 * `installment.paid`. Idempotent : un callback rejoué ne crée ni second reçu
 * ni double comptage (unicité du reçu par paiement, dans la même transaction).
 */
@Injectable()
export class RecoveryService implements OnModuleInit {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly hooks: PaymentHooks,
    private readonly messaging: MessagingService,
    @Optional() private readonly webhooks?: WebhookDeliveryService,
  ) {}

  onModuleInit() {
    this.hooks.onSucceeded('recouvrement', async (tx) => {
      await this.onPaymentSucceeded(tx);
    });
  }

  async onPaymentSucceeded(tx: Transaction): Promise<Receipt | null> {
    if (tx.status !== 'SUCCEEDED') return null;
    let applied: Applied | null;
    try {
      applied = await this.prisma.$transaction((db) => this.apply(db, tx), { timeout: 15_000, maxWait: 10_000 });
    } catch (err) {
      // Course entre deux livraisons du même callback : l'unicité du reçu a tranché.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
    if (!applied) return null;
    await this.afterCommit(tx, applied);
    return applied.receipt;
  }

  private async apply(db: Prisma.TransactionClient, tx: Transaction): Promise<Applied | null> {
    if (await db.receipt.findUnique({ where: { transactionId: tx.id } })) return null;

    // Cible : versement ou facture payés par ce lien de paiement.
    let installment = tx.paymentLinkId ? await db.invoiceInstallment.findUnique({ where: { paymentLinkId: tx.paymentLinkId } }) : null;
    const invoiceId = installment?.invoiceId ?? (tx.paymentLinkId ? (await db.invoice.findUnique({ where: { paymentLinkId: tx.paymentLinkId }, select: { id: true } }))?.id : undefined);
    let invoice = null;
    let invoicePaidNow = false;
    if (invoiceId) {
      // Même verrou que l'envoi des relances : décision sérialisée.
      await db.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (inv.merchantId === tx.merchantId && inv.livemode === tx.livemode) {
        const amountPaid = inv.amountPaid + tx.amount;
        const amountDue = inv.total > amountPaid ? inv.total - amountPaid : 0n;
        const paid = amountDue === 0n;
        invoicePaidNow = paid && inv.status !== 'PAID';
        invoice = await db.invoice.update({
          where: { id: inv.id },
          data: {
            amountPaid,
            amountDue,
            // Un paiement sur une facture annulée (lien ouvert avant l'annulation) reste tracé.
            ...(inv.status === 'VOID' ? {} : { status: paid ? 'PAID' : inv.status === 'OVERDUE' ? 'OVERDUE' : 'PARTIAL' }),
            ...(invoicePaidNow ? { paidAt: new Date() } : {}),
          },
        });
        if (installment) {
          const paidAmount = installment.paidAmount + tx.amount;
          installment = await db.invoiceInstallment.update({
            where: { id: installment.id },
            data: { paidAmount, ...(paidAmount >= installment.amount ? { status: 'PAID', paidAt: new Date() } : {}) },
          });
          if (installment.status === 'PAID') {
            await db.invoiceReminder.updateMany({ where: { installmentId: installment.id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'payée' } });
            await db.studentFeeSchedule.updateMany({ where: { installmentId: installment.id }, data: { status: 'PAID', amountPaid: installment.amount } });
          }
        }
        if (paid) {
          await db.invoiceReminder.updateMany({ where: { invoiceId: inv.id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'payée' } });
          await db.invoiceInstallment.updateMany({ where: { invoiceId: inv.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date() } });
          await db.$executeRaw`UPDATE student_fee_schedules SET status = 'PAID', amount_paid = amount, updated_at = NOW() WHERE invoice_id = ${inv.id}`;
        }
      } else {
        installment = null;
      }
    }

    const description = invoice ? (installment ? `Facture ${invoice.number} - versement ${installment.position}` : `Facture ${invoice.number}`) : await this.linkDescription(db, tx);
    const payerName = invoice?.customerId ? (await db.customer.findUnique({ where: { id: invoice.customerId }, select: { name: true } }))?.name ?? null : null;
    const number = await nextDocumentNumber(db, tx.merchantId, 'receipt', tx.livemode);
    const receipt = await db.receipt.create({
      data: {
        merchantId: tx.merchantId,
        livemode: tx.livemode,
        transactionId: tx.id,
        invoiceId: invoice?.id ?? null,
        installmentId: installment?.id ?? null,
        number,
        amount: tx.amount,
        currency: tx.currency,
        payerName,
        description,
      },
    });
    return { receipt, invoice, installment, invoicePaidNow };
  }

  private async linkDescription(db: Prisma.TransactionClient, tx: Transaction): Promise<string | null> {
    if (tx.paymentLinkId) {
      const link = await db.paymentLink.findFirst({ where: { id: tx.paymentLinkId, livemode: tx.livemode }, select: { description: true } });
      if (link) return link.description;
    }
    return tx.payerMessage ?? null;
  }

  /** Après validation : reçu au client (non bloquant) et webhooks du marchand. */
  private async afterCommit(tx: Transaction, a: Applied) {
    await this.sendReceipt(tx, a.receipt, a.invoice?.customerId ?? null).catch((err) => this.logger.warn(`Reçu ${a.receipt.id} non envoyé : ${(err as Error).message}`));
    if (!this.webhooks || !a.invoice) return;
    const dispatch = (event: string, object: Record<string, unknown>) =>
      this.webhooks!.dispatch(tx.merchantId, tx.livemode, event, object).catch((err) => this.logger.warn(`Webhook ${event} non créé : ${(err as Error).message}`));
    const invoiceObject = {
      id: a.invoice.id,
      object: 'invoice',
      number: a.invoice.number,
      total: toMajorAmount(a.invoice.total, a.invoice.currency),
      amount_paid: toMajorAmount(a.invoice.amountPaid, a.invoice.currency),
      amount_due: toMajorAmount(a.invoice.amountDue, a.invoice.currency),
      currency: a.invoice.currency,
      payment: tx.id,
      receipt: a.receipt.number,
    };
    if (a.installment?.status === 'PAID') {
      await dispatch('installment.paid', { id: a.installment.id, object: 'installment', invoice: a.invoice.id, position: a.installment.position, amount: toMajorAmount(a.installment.amount, a.invoice.currency), payment: tx.id, receipt: a.receipt.number });
    }
    if (a.invoicePaidNow) await dispatch('invoice.paid', invoiceObject);
  }

  /** Reçu envoyé au client : ses canaux s'il est connu, sinon un SMS au numéro qui a payé. */
  private async sendReceipt(tx: Transaction, receipt: Receipt, customerId: string | null) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: tx.merchantId }, select: { name: true } });
    const customer = customerId ? await this.prisma.customer.findUnique({ where: { id: customerId } }) : null;
    const channels = customer ? reachableChannels(customer) : [];
    const to = customer && channels.length ? { phone: customer.phone ?? undefined, email: customer.email ?? undefined } : tx.payerPhoneEnc ? { phone: decryptField(tx.payerPhoneEnc) } : null;
    if (!to) return;
    await this.messaging.send({
      merchantId: tx.merchantId,
      livemode: tx.livemode,
      channels: channels.length ? channels : ['SMS'],
      to,
      templateKey: 'recu.paiement',
      variables: {
        merchantName: merchant?.name ?? '',
        amount: formatAmount(receipt.amount, receipt.currency),
        number: receipt.number,
        reference: tx.externalId,
        link: publicDocumentUrl('receipt', receipt.id),
      },
      category: 'TRANSACTIONAL',
    });
    await this.prisma.receipt.update({ where: { id: receipt.id }, data: { sentAt: new Date() } });
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  async listReceipts(merchantId: string, livemode: boolean, limit: number, startingAfter?: string, invoiceId?: string) {
    const rows = await this.prisma.receipt.findMany({
      where: { merchantId, livemode, ...(invoiceId ? { invoiceId } : {}), ...afterCursor(decodeCursor(startingAfter)) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { invoice: { select: { number: true } } },
    });
    return page(rows, limit, (r) => ({
      id: r.id,
      object: 'receipt',
      livemode: r.livemode,
      number: r.number,
      amount: toMajorAmount(r.amount, r.currency),
      amount_display: formatAmount(r.amount, r.currency),
      currency: r.currency,
      payer_name: r.payerName,
      description: r.description,
      invoice: r.invoiceId ? { id: r.invoiceId, number: r.invoice?.number ?? null } : null,
      payment: r.transactionId,
      sent_at: r.sentAt,
      created_at: r.createdAt,
      pdf_url: publicDocumentUrl('receipt', r.id),
    }));
  }

  async receiptPdf(merchantId: string | undefined, id: string): Promise<{ filename: string; pdf: Buffer }> {
    const r = await this.prisma.receipt.findFirst({
      where: { id, ...(merchantId ? { merchantId } : {}) },
      include: {
        merchant: { select: { name: true } },
        invoice: { select: { number: true, student: { select: { firstName: true, lastName: true, schoolClass: { select: { name: true, schoolYear: { select: { label: true } } } } } } } },
      },
    });
    if (!r) throw new ApiError(HttpStatus.NOT_FOUND, 'document_introuvable', 'Reçu introuvable', 'id');
    const tx = r.transactionId ? await this.prisma.transaction.findFirst({ where: { id: r.transactionId, livemode: ANY_MODE } }) : null;
    const student = r.invoice?.student;
    const pdf = await renderReceiptPdf({
      merchantName: r.merchant.name,
      livemode: r.livemode,
      number: r.number,
      paidAt: tx?.updatedAt ?? r.createdAt,
      amount: r.amount,
      currency: r.currency,
      operator: tx ? (OPERATOR_LABEL[tx.operator] ?? tx.operator) : '—',
      reference: tx?.externalId ?? '—',
      payerName: r.payerName,
      payerPhoneMask: tx?.payerPhoneMask ?? null,
      description: r.description,
      invoiceNumber: r.invoice?.number ?? null,
      student: student ? { name: `${student.firstName} ${student.lastName}`, className: student.schoolClass?.name ?? null, year: student.schoolClass?.schoolYear.label ?? null } : null,
    });
    return { filename: `recu-${r.number}.pdf`, pdf };
  }
}
