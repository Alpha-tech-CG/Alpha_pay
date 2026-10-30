import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceStatus, PrismaClient, RecoverySettings } from '@paybrain/database';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount } from '../../common/money';
import { CronLockService } from '../../common/scheduling/cron-lock.service';
import { MessagingService } from '../messaging/messaging.service';
import { PaymentLinksService } from '../payment-links/payment-links.service';
import { RecoverySettingsDto } from './invoicing.dto';
import { DEFAULT_WINDOW, localDate, nextInWindow, reminderTime, SendWindow } from './recovery-time';

export const DEFAULT_OFFSETS = [-3, 0, 3, 7];
const OPEN: InvoiceStatus[] = ['SENT', 'PARTIAL', 'OVERDUE'];
const BATCH = 100;

export function presentSettings(s: Pick<RecoverySettings, 'reminderOffsets' | 'remindersEnabled' | 'sendFromHour' | 'sendUntilHour'> | null) {
  return {
    object: 'recovery_settings',
    reminder_offsets: s?.reminderOffsets ?? DEFAULT_OFFSETS,
    reminders_enabled: s?.remindersEnabled ?? true,
    send_from_hour: s?.sendFromHour ?? DEFAULT_WINDOW.fromHour,
    send_until_hour: s?.sendUntilHour ?? DEFAULT_WINDOW.untilHour,
    timezone: 'Africa/Brazzaville',
  };
}

function windowOf(s: RecoverySettings | null): SendWindow {
  return s ? { fromHour: s.sendFromHour, untilHour: s.sendUntilHour } : DEFAULT_WINDOW;
}

/**
 * Relances automatiques (§M7) : J-3, J0, J+3, J+7 par défaut (modifiables par
 * le marchand), dans la plage 8 h-19 h heure de Brazzaville, sur les canaux
 * préférés du client avec bascule. Arrêt dès que la facture ou le versement
 * est payé : le paiement et l'envoi verrouillent la même ligne de facture, donc
 * une relance n'est jamais décidée sur un état périmé.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly messaging: MessagingService,
    private readonly cronLock: CronLockService,
    private readonly audit: AuditService,
  ) {}

  // ─── Réglages ─────────────────────────────────────────────────────────────

  async getSettings(merchantId: string) {
    return presentSettings(await this.prisma.recoverySettings.findUnique({ where: { merchantId } }));
  }

  /** Le nouveau calendrier s'applique aux relances encore à venir des factures ouvertes. */
  async updateSettings(merchantId: string, dto: RecoverySettingsDto, actor: { id: string; ip?: string }) {
    const current = await this.prisma.recoverySettings.findUnique({ where: { merchantId } });
    const from = dto.send_from_hour ?? current?.sendFromHour ?? DEFAULT_WINDOW.fromHour;
    const until = dto.send_until_hour ?? current?.sendUntilHour ?? DEFAULT_WINDOW.untilHour;
    if (from >= until) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'plage_horaire_invalide', "L'heure de début doit précéder l'heure de fin", 'send_from_hour');
    }
    const data = {
      ...(dto.reminder_offsets ? { reminderOffsets: [...dto.reminder_offsets].sort((a, b) => a - b) } : {}),
      ...(dto.reminders_enabled !== undefined ? { remindersEnabled: dto.reminders_enabled } : {}),
      sendFromHour: from,
      sendUntilHour: until,
    };
    const saved = await this.prisma.recoverySettings.upsert({ where: { merchantId }, create: { merchantId, ...data }, update: data });
    await this.audit.record({ actorType: 'user', actorId: actor.id, merchantId, action: 'recovery.settings_updated', targetType: 'merchant', targetId: merchantId, ip: actor.ip ?? null, metadata: { offsets: saved.reminderOffsets, from, until, enabled: saved.remindersEnabled } });

    const open = await this.prisma.invoice.findMany({ where: { merchantId, status: { in: OPEN } }, select: { id: true } });
    for (const inv of open) await this.scheduleForInvoice(inv.id);
    return presentSettings(saved);
  }

  // ─── Planification ────────────────────────────────────────────────────────

  /**
   * (Re)planifie les relances à venir d'une facture ouverte : une par échéance
   * impayée (versement, ou facture sans échéancier) et par décalage du
   * calendrier. Les relances déjà parties restent dans l'historique.
   */
  async scheduleForInvoice(invoiceId: string, now = new Date()): Promise<number> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { installments: true, customer: true } });
    if (!inv) return 0;
    await this.prisma.invoiceReminder.deleteMany({ where: { invoiceId, status: 'PENDING' } });
    if (!OPEN.includes(inv.status) || !inv.customer) return 0;
    const settings = await this.prisma.recoverySettings.findUnique({ where: { merchantId: inv.merchantId } });
    if (settings && !settings.remindersEnabled) return 0;
    const offsets = settings?.reminderOffsets ?? DEFAULT_OFFSETS;
    const w = windowOf(settings);

    const targets =
      inv.installments.length > 0
        ? inv.installments.filter((i) => i.status === 'PENDING').map((i) => ({ installmentId: i.id as string | null, dueDate: i.dueDate }))
        : inv.dueDate
          ? [{ installmentId: null, dueDate: inv.dueDate }]
          : [];
    const sent = await this.prisma.invoiceReminder.findMany({ where: { invoiceId, status: { not: 'PENDING' } }, select: { installmentId: true, daysOffset: true } });
    const already = new Set(sent.map((r) => `${r.installmentId ?? ''}:${r.daysOffset}`));

    const rows = [];
    for (const t of targets) {
      for (const offset of offsets) {
        if (already.has(`${t.installmentId ?? ''}:${offset}`)) continue;
        const at = reminderTime(t.dueDate, offset, w, now);
        if (at) rows.push({ invoiceId, installmentId: t.installmentId, daysOffset: offset, scheduledFor: at, channel: inv.customer.preferredChannels[0] ?? 'SMS' });
      }
    }
    if (rows.length) await this.prisma.invoiceReminder.createMany({ data: rows });
    return rows.length;
  }

  /** Arrête les relances à venir (facture payée ou annulée, versement payé). */
  async cancelPending(invoiceId: string, installmentId?: string) {
    await this.prisma.invoiceReminder.updateMany({
      where: { invoiceId, status: 'PENDING', ...(installmentId ? { installmentId } : {}) },
      data: { status: 'SKIPPED', error: 'payée' },
    });
  }

  // ─── Envoi ────────────────────────────────────────────────────────────────

  @Cron('0 */5 * * * *')
  async tick() {
    await this.cronLock.runExclusive('invoice-reminders', async () => {
      await this.sendDue();
    });
  }

  /** Envoie les relances arrivées à échéance ; renvoie le nombre de messages partis. */
  async sendDue(now = new Date()): Promise<number> {
    const due = await this.prisma.invoiceReminder.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: now } },
      orderBy: { scheduledFor: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    let sent = 0;
    for (const { id } of due) {
      try {
        if (await this.sendOne(id, now)) sent++;
      } catch (err) {
        this.logger.error(`Relance ${id} en échec : ${(err as Error).message}`);
        await this.prisma.invoiceReminder.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED', error: 'erreur_interne' } });
      }
    }
    return sent;
  }

  /**
   * Décision d'envoi sous verrou de la facture (SELECT … FOR UPDATE) : le
   * paiement (RecoveryService) prend le même verrou. Soit le paiement est
   * appliqué d'abord et la relance est annulée, soit la relance est décidée
   * d'abord, avant que le paiement n'existe.
   */
  async sendOne(reminderId: string, now = new Date()): Promise<boolean> {
    const decision = await this.prisma.$transaction(async (db) => {
      const rem = await db.invoiceReminder.findUnique({ where: { id: reminderId } });
      if (!rem || rem.status !== 'PENDING') return null;
      await db.$queryRaw`SELECT id FROM invoices WHERE id = ${rem.invoiceId} FOR UPDATE`;
      const inv = await db.invoice.findUniqueOrThrow({ where: { id: rem.invoiceId }, include: { customer: true, merchant: { select: { name: true } } } });
      const inst = rem.installmentId ? await db.invoiceInstallment.findUnique({ where: { id: rem.installmentId } }) : null;
      const settled = !OPEN.includes(inv.status) || (inst && inst.status !== 'PENDING');
      if (settled) {
        await db.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'SKIPPED', error: inv.status === 'VOID' ? 'annulée' : 'payée' } });
        return null;
      }
      const settings = await db.recoverySettings.findUnique({ where: { merchantId: inv.merchantId } });
      if (settings && !settings.remindersEnabled) {
        await db.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'SKIPPED', error: 'relances_désactivées' } });
        return null;
      }
      // Hors plage (tâche en retard) : reportée au prochain créneau autorisé.
      const slot = nextInWindow(now, windowOf(settings));
      if (slot.getTime() !== now.getTime()) {
        await db.invoiceReminder.update({ where: { id: rem.id }, data: { scheduledFor: slot } });
        return null;
      }
      const channels = inv.customer ? inv.customer.preferredChannels.filter((ch) => (ch === 'EMAIL' ? !!inv.customer!.email : !!inv.customer!.phone)) : [];
      if (!inv.customer || channels.length === 0) {
        await db.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'FAILED', error: 'aucun_contact' } });
        return null;
      }
      await db.invoiceReminder.update({ where: { id: rem.id }, data: { status: 'SENT', sentAt: now, channel: channels[0] } });
      const linkId = inst?.paymentLinkId ?? inv.paymentLinkId;
      const link = linkId ? await db.paymentLink.findFirst({ where: { id: linkId, livemode: inv.livemode } }) : null;
      const dueDate = inst?.dueDate ?? inv.dueDate!;
      const amount = inst ? inst.amount - inst.paidAmount : inv.amountDue;
      return { inv, channels, link, dueDate, amount, offset: rem.daysOffset };
    }, { timeout: 15_000, maxWait: 10_000 });
    if (!decision) return false;

    const { inv, channels, link, dueDate, amount, offset } = decision;
    const dueText = dueDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
    await this.messaging.send({
      merchantId: inv.merchantId,
      livemode: inv.livemode,
      channels,
      to: { phone: inv.customer!.phone ?? undefined, email: inv.customer!.email ?? undefined },
      templateKey: 'facture.relance',
      variables: {
        merchantName: inv.merchant.name,
        number: inv.number ?? '',
        amount: formatAmount(amount, inv.currency),
        when: offset < 0 ? `à régler avant le ${dueText}` : offset === 0 ? `à régler aujourd'hui (${dueText})` : `échue depuis le ${dueText}`,
        link: link?.publicCode ? PaymentLinksService.checkoutUrl(link.publicCode) : '',
      },
      category: 'TRANSACTIONAL',
    });
    return true;
  }

  // ─── Retards ──────────────────────────────────────────────────────────────

  @Cron('0 15 0 * * *', { timeZone: 'Africa/Brazzaville' })
  async daily() {
    await this.cronLock.runExclusive('invoice-overdue', async () => {
      await this.markOverdue();
    });
  }

  /** Échéance passée (jour de Brazzaville) et pas encore payée → en_retard. */
  async markOverdue(now = new Date()): Promise<number> {
    const todayDate = new Date(`${localDate(now)}T00:00:00.000Z`);
    const lateInstallments = await this.prisma.invoiceInstallment.findMany({
      where: { status: 'PENDING', dueDate: { lt: todayDate }, invoice: { status: { in: ['SENT', 'PARTIAL'] } } },
      select: { invoiceId: true },
      distinct: ['invoiceId'],
    });
    const res = await this.prisma.invoice.updateMany({
      where: {
        status: { in: ['SENT', 'PARTIAL'] },
        OR: [{ installments: { none: {} }, dueDate: { lt: todayDate } }, { id: { in: lateInstallments.map((i) => i.invoiceId) } }],
      },
      data: { status: 'OVERDUE' },
    });
    if (res.count) this.logger.log(`${res.count} facture(s) passée(s) en retard`);
    return res.count;
  }
}
