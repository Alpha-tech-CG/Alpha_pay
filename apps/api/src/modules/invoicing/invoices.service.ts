import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  Customer,
  Invoice,
  InvoiceInstallment,
  InvoiceLine,
  InvoiceStatus,
  PaymentLink,
  Prisma,
  PrismaClient,
  Receipt,
} from '@paybrain/database';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount, toMinor } from '../../common/money';
import { afterCursor, decodeCursor, page } from '../../common/pagination/cursor';
import { MessagingService } from '../messaging/messaging.service';
import { LinkActor, PaymentLinksService } from '../payment-links/payment-links.service';
import { publicDocumentUrl } from '../providers/callback-token';
import { presentCustomer } from './customers.service';
import { nextDocumentNumber } from './document-numbers';
import { renderInvoicePdf } from './documents.pdf';
import { CreateInvoiceDto, InstallmentDto, InvoiceLineDto, ListInvoicesQuery } from './invoicing.dto';
import { RemindersService } from './reminders.service';

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'brouillon',
  SENT: 'envoyée',
  PARTIAL: 'partiellement_payée',
  PAID: 'payée',
  OVERDUE: 'en_retard',
  VOID: 'annulée',
};
const STATUS_BY_LABEL = Object.fromEntries(Object.entries(INVOICE_STATUS_LABEL).map(([k, v]) => [v, k])) as Record<string, InvoiceStatus>;
export const INSTALLMENT_STATUS_LABEL: Record<string, string> = { PENDING: 'en_attente', PAID: 'payé', CANCELED: 'annulé' };

/** Statuts où la facture attend encore un paiement. */
export const OPEN_STATUSES: InvoiceStatus[] = ['SENT', 'PARTIAL', 'OVERDUE'];

type FullInvoice = Invoice & {
  lines: InvoiceLine[];
  installments: InvoiceInstallment[];
  customer: Customer | null;
  receipts?: Receipt[];
  student?: { firstName: string; lastName: string; schoolClass: { name: string; schoolYear: { label: string } } | null } | null;
};

export interface InvoiceActor {
  type: 'user' | 'api_key' | 'system';
  id: string;
  ip?: string;
}

const FULL_INCLUDE = {
  lines: { orderBy: { sortOrder: 'asc' } },
  installments: { orderBy: { position: 'asc' } },
  customer: true,
  receipts: { orderBy: { createdAt: 'asc' } },
  student: { select: { firstName: true, lastName: true, schoolClass: { select: { name: true, schoolYear: { select: { label: true } } } } } },
} satisfies Prisma.InvoiceInclude;

/**
 * Factures du marchand (§M7). Montants en unités mineures en base, majeures
 * dans l'API. Une facture envoyée reçoit un numéro sans trou, un lien de
 * paiement (ou un lien par versement) qui encaisse sur le compte Mobile Money
 * DU MARCHAND, et ses relances. Un paiement réussi la met à jour
 * automatiquement (RecoveryService).
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly links: PaymentLinksService,
    private readonly reminders: RemindersService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  // ─── Création ─────────────────────────────────────────────────────────────

  async create(merchantId: string, livemode: boolean, dto: CreateInvoiceDto, actor: InvoiceActor, extra: { studentId?: string } = {}) {
    const currency = dto.currency ?? 'XAF';
    if (dto.customer_id) await this.assertCustomer(merchantId, livemode, dto.customer_id);
    const { subtotal, taxAmount, total, lines } = computeAmounts(dto.lines, currency);
    if (total <= 0n) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'montant_invalide', 'Le total de la facture doit être positif', 'lines');
    const installments = dto.installments ? planInstallments(dto.installments, total, currency) : [];

    const invoice = await this.prisma.invoice.create({
      data: {
        merchantId,
        livemode,
        customerId: dto.customer_id ?? null,
        studentId: extra.studentId ?? null,
        currency,
        issueDate: new Date(),
        dueDate: dto.due_date ? new Date(dto.due_date) : installments.length ? installments[installments.length - 1].dueDate : null,
        notes: dto.notes ?? null,
        subtotal,
        taxAmount,
        total,
        amountDue: total,
        lines: { create: lines },
        installments: { create: installments },
      },
    });
    await this.record(actor, merchantId, 'invoice.created', invoice.id, { livemode });
    if (dto.send) return this.send(merchantId, livemode, invoice.id, actor);
    return this.get(merchantId, livemode, invoice.id);
  }

  /** Remplace l'échéancier d'une facture encore en brouillon. */
  async setInstallments(merchantId: string, livemode: boolean, id: string, items: InstallmentDto[], actor: InvoiceActor) {
    const inv = await this.find(merchantId, livemode, id);
    if (inv.status !== 'DRAFT') throw new ApiError(HttpStatus.CONFLICT, 'facture_non_modifiable', "L'échéancier ne se modifie que sur une facture en brouillon");
    const installments = planInstallments(items, inv.total, inv.currency);
    await this.prisma.$transaction([
      this.prisma.invoiceInstallment.deleteMany({ where: { invoiceId: id } }),
      this.prisma.invoiceInstallment.createMany({ data: installments.map((i) => ({ ...i, invoiceId: id })) }),
      this.prisma.invoice.update({ where: { id }, data: { dueDate: installments[installments.length - 1].dueDate } }),
    ]);
    await this.record(actor, merchantId, 'invoice.installments_set', id, { count: installments.length });
    return this.get(merchantId, livemode, id);
  }

  // ─── Envoi ────────────────────────────────────────────────────────────────

  /**
   * Brouillon → envoyée : numéro sans trou, liens de paiement, relances
   * planifiées, facture transmise au client. Rejouable sans effet de bord.
   */
  async send(merchantId: string, livemode: boolean, id: string, actor: InvoiceActor, opts: { notify?: boolean } = {}) {
    const inv = await this.find(merchantId, livemode, id);
    if (inv.status === 'VOID') throw new ApiError(HttpStatus.CONFLICT, 'facture_annulee', 'Cette facture est annulée');
    if (inv.status === 'DRAFT') {
      const claimed = await this.prisma.$transaction(async (db) => {
        const number = await nextDocumentNumber(db, merchantId, 'invoice', livemode);
        const res = await db.invoice.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'SENT', number, sentAt: new Date() } });
        if (res.count === 0) throw new ApiError(HttpStatus.CONFLICT, 'facture_deja_envoyee', 'Facture déjà envoyée');
        return true;
      });
      if (claimed) {
        await this.ensurePaymentLinks(id);
        await this.reminders.scheduleForInvoice(id);
        await this.record(actor, merchantId, 'invoice.sent', id, { livemode });
        if (opts.notify !== false) await this.notifyCustomer(id);
      }
    } else {
      await this.ensurePaymentLinks(id);
    }
    return this.get(merchantId, livemode, id);
  }

  /** Crée les liens manquants (facture sans échéancier : un lien ; sinon un par versement). */
  async ensurePaymentLinks(invoiceId: string): Promise<void> {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { installments: { orderBy: { position: 'asc' } }, merchant: { select: { name: true } } } });
    if (!OPEN_STATUSES.includes(inv.status)) return;
    const actor: LinkActor = { type: 'system', id: 'recouvrement' };
    const label = `Facture ${inv.number}`;
    if (inv.installments.length === 0) {
      if (inv.paymentLinkId) return;
      const link = await this.links.create(inv.merchantId, inv.livemode, { amount: toMajorAmount(inv.amountDue, inv.currency), currency: inv.currency, description: label }, actor);
      await this.prisma.invoice.updateMany({ where: { id: inv.id, paymentLinkId: null }, data: { paymentLinkId: link.id } });
      return;
    }
    for (const i of inv.installments) {
      if (i.paymentLinkId || i.status !== 'PENDING') continue;
      const description = `${label} - ${i.label ?? `versement ${i.position}/${inv.installments.length}`}`;
      const link = await this.links.create(inv.merchantId, inv.livemode, { amount: toMajorAmount(i.amount - i.paidAmount, inv.currency), currency: inv.currency, description }, actor);
      await this.prisma.invoiceInstallment.updateMany({ where: { id: i.id, paymentLinkId: null }, data: { paymentLinkId: link.id } });
    }
  }

  /** Facture transmise au client sur ses canaux préférés (lien de paiement + PDF). */
  async notifyCustomer(invoiceId: string): Promise<boolean> {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, installments: { orderBy: { position: 'asc' } }, merchant: { select: { name: true } } } });
    if (!inv.customer) return false;
    const channels = reachableChannels(inv.customer);
    if (channels.length === 0) return false;
    const next = inv.installments.find((i) => i.status === 'PENDING');
    const linkId = next?.paymentLinkId ?? inv.paymentLinkId;
    const link = linkId ? await this.prisma.paymentLink.findFirst({ where: { id: linkId, livemode: inv.livemode } }) : null;
    await this.messaging
      .send({
        merchantId: inv.merchantId,
        livemode: inv.livemode,
        channels,
        to: { phone: inv.customer.phone ?? undefined, email: inv.customer.email ?? undefined },
        templateKey: 'facture.envoi',
        variables: {
          merchantName: inv.merchant.name,
          number: inv.number ?? '',
          amount: formatAmount(next ? next.amount - next.paidAmount : inv.amountDue, inv.currency),
          dueDate: (next?.dueDate ?? inv.dueDate)?.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) ?? '-',
          link: link?.publicCode ? PaymentLinksService.checkoutUrl(link.publicCode) : '',
          pdf: publicDocumentUrl('invoice', inv.id),
        },
        category: 'TRANSACTIONAL',
      })
      .catch((err) => this.logger.warn(`Facture ${inv.id} non transmise : ${(err as Error).message}`));
    return true;
  }

  // ─── Annulation ───────────────────────────────────────────────────────────

  async void(merchantId: string, livemode: boolean, id: string, actor: InvoiceActor) {
    const inv = await this.find(merchantId, livemode, id);
    if (inv.status === 'VOID') return this.get(merchantId, livemode, id);
    if (inv.amountPaid > 0n) {
      throw new ApiError(HttpStatus.CONFLICT, 'facture_deja_payee', "Une facture déjà (partiellement) payée ne peut pas être annulée : l'argent est sur votre compte Mobile Money");
    }
    const res = await this.prisma.invoice.updateMany({ where: { id, amountPaid: 0n, status: { not: 'VOID' } }, data: { status: 'VOID', amountDue: 0n } });
    if (res.count === 0) throw new ApiError(HttpStatus.CONFLICT, 'facture_deja_payee', 'Un paiement vient d’arriver sur cette facture');
    await this.prisma.invoiceInstallment.updateMany({ where: { invoiceId: id, status: 'PENDING' }, data: { status: 'CANCELED' } });
    await this.prisma.studentFeeSchedule.updateMany({ where: { invoiceId: id, status: 'PENDING' }, data: { status: 'CANCELED' } });
    await this.reminders.cancelPending(id);
    await this.deactivateLinks(inv);
    await this.record(actor, merchantId, 'invoice.voided', id, { livemode });
    return this.get(merchantId, livemode, id);
  }

  private async deactivateLinks(inv: Invoice) {
    const installments = await this.prisma.invoiceInstallment.findMany({ where: { invoiceId: inv.id }, select: { paymentLinkId: true } });
    const ids = [inv.paymentLinkId, ...installments.map((i) => i.paymentLinkId)].filter((x): x is string => !!x);
    if (ids.length) await this.prisma.paymentLink.updateMany({ where: { id: { in: ids }, livemode: inv.livemode }, data: { active: false } });
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  async list(merchantId: string, livemode: boolean, query: ListInvoicesQuery, limit: number, startingAfter?: string) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        merchantId,
        livemode,
        ...(query.status ? { status: STATUS_BY_LABEL[query.status] } : {}),
        ...(query.customer_id ? { customerId: query.customer_id } : {}),
        ...(query.q ? { OR: [{ number: { contains: query.q, mode: 'insensitive' } }, { customer: { name: { contains: query.q, mode: 'insensitive' } } }] } : {}),
        ...afterCursor(decodeCursor(startingAfter)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { customer: true },
    });
    return page(rows, limit, (inv) => this.presentSummary(inv));
  }

  async get(merchantId: string, livemode: boolean, id: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, merchantId, livemode }, include: FULL_INCLUDE });
    if (!inv) throw new ApiError(HttpStatus.NOT_FOUND, 'facture_introuvable', 'Facture introuvable', 'id');
    return this.present(inv);
  }

  async pdf(merchantId: string, livemode: boolean | undefined, id: string): Promise<{ filename: string; pdf: Buffer }> {
    const inv = await this.prisma.invoice.findFirst({ where: { id, merchantId, ...(livemode === undefined ? {} : { livemode }) }, include: { ...FULL_INCLUDE, merchant: { select: { name: true } } } });
    if (!inv) throw new ApiError(HttpStatus.NOT_FOUND, 'facture_introuvable', 'Facture introuvable', 'id');
    const presented = await this.present(inv);
    const pdf = await renderInvoicePdf({
      merchantName: inv.merchant.name,
      livemode: inv.livemode,
      number: inv.number,
      status: presented.status.replace(/_/g, ' '),
      currency: inv.currency,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      customer: inv.customer,
      student: presented.student,
      lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice, amount: l.amount })),
      subtotal: inv.subtotal,
      taxAmount: inv.taxAmount,
      total: inv.total,
      amountPaid: inv.amountPaid,
      amountDue: inv.amountDue,
      installments: inv.installments.map((i, idx) => ({ label: i.label ?? `Versement ${idx + 1}`, dueDate: i.dueDate, amount: i.amount, status: INSTALLMENT_STATUS_LABEL[i.status] ?? i.status })),
      paymentUrl: presented.payment_url,
      notes: inv.notes,
    });
    return { filename: `facture-${inv.number ?? 'brouillon'}.pdf`, pdf };
  }

  /** Facture visible par le seul lien signé (PDF envoyé au client). */
  async publicPdf(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, select: { merchantId: true, status: true } });
    if (!inv || inv.status === 'DRAFT') throw new ApiError(HttpStatus.NOT_FOUND, 'document_introuvable', 'Document introuvable');
    return this.pdf(inv.merchantId, undefined, id);
  }

  async find(merchantId: string, livemode: boolean, id: string): Promise<Invoice> {
    const inv = await this.prisma.invoice.findFirst({ where: { id, merchantId, livemode } });
    if (!inv) throw new ApiError(HttpStatus.NOT_FOUND, 'facture_introuvable', 'Facture introuvable', 'id');
    return inv;
  }

  private async assertCustomer(merchantId: string, livemode: boolean, customerId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, merchantId, livemode }, select: { id: true } });
    if (!c) throw new ApiError(HttpStatus.NOT_FOUND, 'client_introuvable', 'Client introuvable', 'customer_id');
  }

  // ─── Présentation ─────────────────────────────────────────────────────────

  private presentSummary(inv: Invoice & { customer: Customer | null }) {
    return {
      id: inv.id,
      object: 'invoice',
      livemode: inv.livemode,
      number: inv.number,
      status: INVOICE_STATUS_LABEL[inv.status],
      currency: inv.currency,
      total: toMajorAmount(inv.total, inv.currency),
      amount_paid: toMajorAmount(inv.amountPaid, inv.currency),
      amount_due: toMajorAmount(inv.amountDue, inv.currency),
      total_display: formatAmount(inv.total, inv.currency),
      amount_due_display: formatAmount(inv.amountDue, inv.currency),
      due_date: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
      customer: inv.customer ? { id: inv.customer.id, name: inv.customer.name } : null,
      student_id: inv.studentId,
      created_at: inv.createdAt,
    };
  }

  private async present(inv: FullInvoice) {
    const linkIds = [inv.paymentLinkId, ...inv.installments.map((i) => i.paymentLinkId)].filter((x): x is string => !!x);
    const links = linkIds.length ? await this.prisma.paymentLink.findMany({ where: { id: { in: linkIds }, livemode: inv.livemode } }) : [];
    const byId = new Map<string, PaymentLink>(links.map((l) => [l.id, l]));
    const open = OPEN_STATUSES.includes(inv.status);
    const urlOf = (linkId: string | null, payable: boolean) => {
      const l = linkId ? byId.get(linkId) : undefined;
      return payable && l?.publicCode && l.active ? PaymentLinksService.checkoutUrl(l.publicCode) : null;
    };
    const installments = inv.installments.map((i) => ({
      id: i.id,
      object: 'installment',
      label: i.label,
      position: i.position,
      due_date: i.dueDate.toISOString().slice(0, 10),
      amount: toMajorAmount(i.amount, inv.currency),
      amount_paid: toMajorAmount(i.paidAmount, inv.currency),
      amount_display: formatAmount(i.amount, inv.currency),
      status: INSTALLMENT_STATUS_LABEL[i.status] ?? i.status,
      paid_at: i.paidAt,
      payment_url: urlOf(i.paymentLinkId, open && i.status === 'PENDING'),
    }));
    const next = installments.find((i) => i.payment_url);
    const student = inv.student
      ? { name: `${inv.student.firstName} ${inv.student.lastName}`, className: inv.student.schoolClass?.name ?? null, year: inv.student.schoolClass?.schoolYear.label ?? null }
      : null;
    return {
      ...this.presentSummary(inv),
      customer: inv.customer ? presentCustomer(inv.customer) : null,
      subtotal: toMajorAmount(inv.subtotal, inv.currency),
      tax_amount: toMajorAmount(inv.taxAmount, inv.currency),
      issue_date: inv.issueDate.toISOString().slice(0, 10),
      notes: inv.notes,
      sent_at: inv.sentAt,
      paid_at: inv.paidAt,
      lines: inv.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: toMajorAmount(l.unitPrice, inv.currency),
        tax_rate: Number(l.taxRate),
        amount: toMajorAmount(l.amount, inv.currency),
      })),
      installments,
      // Lien du prochain versement dû, ou de la facture entière.
      payment_url: inv.installments.length ? (next?.payment_url ?? null) : urlOf(inv.paymentLinkId, open),
      pdf_url: inv.status === 'DRAFT' ? null : publicDocumentUrl('invoice', inv.id),
      receipts: (inv.receipts ?? []).map((r) => ({ id: r.id, number: r.number, amount: toMajorAmount(r.amount, r.currency), created_at: r.createdAt })),
      student,
    };
  }

  private record(actor: InvoiceActor, merchantId: string, action: string, targetId: string, metadata?: Record<string, unknown>) {
    return this.audit.record({
      actorType: actor.type,
      actorId: actor.type === 'system' ? null : actor.id,
      merchantId,
      action,
      targetType: 'invoice',
      targetId,
      ip: actor.ip ?? null,
      metadata,
    });
  }
}

// ─── Calculs (purs, testés unitairement) ─────────────────────────────────────

export function computeAmounts(dtoLines: InvoiceLineDto[], currency: string) {
  let subtotal = 0n;
  let taxAmount = 0n;
  const lines = dtoLines.map((l, idx) => {
    const unitPrice = toMinor(l.unit_price, currency);
    // Arrondi à l'unité mineure : la quantité peut être décimale (3 décimales).
    const amount = BigInt(Math.round(l.quantity * Number(unitPrice)));
    const tax = BigInt(Math.round((Number(amount) * (l.tax_rate ?? 0)) / 100));
    subtotal += amount;
    taxAmount += tax;
    return { description: l.description.trim(), quantity: l.quantity, unitPrice, taxRate: l.tax_rate ?? 0, amount, sortOrder: idx };
  });
  return { subtotal, taxAmount, total: subtotal + taxAmount, lines };
}

/** Échéancier : dates croissantes, montants positifs dont la somme égale le total. */
export function planInstallments(items: InstallmentDto[], total: bigint, currency: string) {
  const plan = items
    .map((i) => ({ dueDate: new Date(i.due_date), amount: toMinor(i.amount, currency), label: i.label ?? null }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((i, idx) => ({ ...i, position: idx + 1 }));
  const sum = plan.reduce((s, i) => s + i.amount, 0n);
  if (sum !== total) {
    throw new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'echeancier_incoherent',
      `La somme des versements (${formatAmount(sum, currency)}) doit égaler le total (${formatAmount(total, currency)})`,
      'installments',
    );
  }
  if (plan.some((i) => i.amount <= 0n)) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'echeancier_incoherent', 'Chaque versement doit être positif', 'installments');
  return plan;
}

/** Canaux préférés du client, réduits à ceux pour lesquels on a un contact. */
export function reachableChannels(c: Pick<Customer, 'preferredChannels' | 'phone' | 'email'>): ('SMS' | 'WHATSAPP' | 'EMAIL')[] {
  return c.preferredChannels.filter((ch) => (ch === 'EMAIL' ? !!c.email : !!c.phone));
}
