import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, ReconciliationDayStatus } from '@paybrain/database';
import { formatAmount, toMajorAmount } from '../../../common/money';
import { parseStatementCsv } from '../statement-parser';
import { localAt } from '../../invoicing/recovery-time';

function toDate(d: string): Date {
  return new Date(d + 'T00:00:00.000Z');
}

/** Journée de Brazzaville (§8.5) : de 0 h à 0 h heure locale, en UTC. */
function localDay(d: string) {
  return { gte: localAt(d, 0), lt: localAt(d, 0, 1) };
}

function presentDay(day: any) {
  return {
    id: day.id,
    object: 'reconciliation_day',
    livemode: day.livemode,
    entry_date: day.entryDate instanceof Date ? day.entryDate.toISOString().slice(0, 10) : day.entryDate,
    till_id: day.tillId ?? null,
    status: day.status.toLowerCase(),
    comment: day.comment ?? null,
    digital_count: day.digitalCount,
    digital_amount: toMajorAmount(day.digitalAmount, day.currency),
    digital_amount_display: formatAmount(day.digitalAmount, day.currency),
    cash_amount: toMajorAmount(day.cashAmount, day.currency),
    cash_amount_display: formatAmount(day.cashAmount, day.currency),
    total_amount: toMajorAmount(BigInt(day.digitalAmount) + BigInt(day.cashAmount), day.currency),
    total_amount_display: formatAmount(BigInt(day.digitalAmount) + BigInt(day.cashAmount), day.currency),
    statement_lines: day.statementLines ?? null,
    statement_amount: day.statementAmount != null ? toMajorAmount(day.statementAmount, day.currency) : null,
    reviewed_at: day.reviewedAt ?? null,
    created_at: day.createdAt,
    updated_at: day.updatedAt,
  };
}

@Injectable()
export class MerchantReconciliationService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /**
   * Calcule et upsert les totaux d'un jour pour une caisse (ou global si tillId null).
   * Appelé avant chaque lecture pour s'assurer que les chiffres sont à jour.
   */
  async computeDay(merchantId: string, date: string, livemode: boolean, tillId?: string | null) {
    const [digital, cash] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          merchantId,
          livemode,
          status: 'SUCCEEDED',
          ...(tillId ? { tillId } : {}),
          createdAt: localDay(date),
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.cashEntry.aggregate({
        where: {
          merchantId,
          livemode,
          ...(tillId ? { tillId } : {}),
          entryDate: toDate(date),
        },
        _sum: { amount: true },
      }),
    ]);

    const digitalAmount = digital._sum.amount ?? 0n;
    const cashAmount = cash._sum.amount ?? 0n;
    const digitalCount = digital._count.id;

    // Upsert : la ligne est unique par (merchant, till/global, date, livemode).
    const existing = await this.prisma.reconciliationDay.findFirst({
      where: { merchantId, tillId: tillId ?? null, entryDate: toDate(date), livemode },
    });

    if (existing) {
      return this.prisma.reconciliationDay.update({
        where: { id: existing.id },
        data: { digitalAmount, cashAmount, digitalCount },
      });
    }
    return this.prisma.reconciliationDay.create({
      data: {
        merchantId,
        tillId: tillId ?? null,
        entryDate: toDate(date),
        livemode,
        digitalAmount,
        cashAmount,
        digitalCount,
        currency: 'XAF',
      },
    });
  }

  /**
   * Vue journalière par caisse (§M6) : pour chaque caisse et pour l'ensemble,
   * total MTN, total Airtel, cash déclaré et statut de rapprochement.
   */
  async dayByTills(merchantId: string, date: string, livemode: boolean, visibleTills: string[] | 'all') {
    const tills = await this.prisma.till.findMany({
      where: { merchantId, ...(visibleTills === 'all' ? {} : { id: { in: visibleTills } }) },
      orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }],
      select: { id: true, name: true, active: true, store: { select: { name: true } } },
    });
    const [byOp, cash] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['tillId', 'operator'],
        where: { merchantId, livemode, status: 'SUCCEEDED', createdAt: localDay(date), ...(visibleTills === 'all' ? {} : { tillId: { in: visibleTills } }) },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.cashEntry.groupBy({
        by: ['tillId'],
        where: { merchantId, livemode, entryDate: toDate(date), ...(visibleTills === 'all' ? {} : { tillId: { in: visibleTills } }) },
        _sum: { amount: true },
      }),
    ]);
    const sumOp = (tillId: string | null | undefined, op: string) =>
      byOp.filter((r) => (tillId === undefined || r.tillId === tillId) && r.operator === op).reduce((t, r) => t + (r._sum.amount ?? 0n), 0n);
    const countOf = (tillId: string | null | undefined) => byOp.filter((r) => tillId === undefined || r.tillId === tillId).reduce((n, r) => n + r._count.id, 0);
    const cashOf = (tillId: string | null | undefined) => cash.filter((r) => tillId === undefined || r.tillId === tillId).reduce((t, r) => t + (r._sum.amount ?? 0n), 0n);

    const rows = [];
    const all = visibleTills === 'all' ? [{ id: null as string | null, label: 'Toutes les caisses' }] : [];
    for (const t of [...tills.map((t) => ({ id: t.id as string | null, label: `${t.store.name} · ${t.name}` })), ...all]) {
      const day = await this.computeDay(merchantId, date, livemode, t.id);
      const key = t.id === null ? undefined : t.id;
      const mtn = sumOp(key, 'MTN');
      const airtel = sumOp(key, 'AIRTEL');
      const cashAmount = cashOf(key);
      rows.push({
        ...presentDay(day),
        till_label: t.label,
        payments_count: countOf(key),
        mtn_amount: toMajorAmount(mtn, 'XAF'),
        mtn_amount_display: formatAmount(mtn, 'XAF'),
        airtel_amount: toMajorAmount(airtel, 'XAF'),
        airtel_amount_display: formatAmount(airtel, 'XAF'),
        cash_amount: toMajorAmount(cashAmount, 'XAF'),
        cash_amount_display: formatAmount(cashAmount, 'XAF'),
      });
    }
    return { object: 'list' as const, date, data: rows };
  }

  async listDays(merchantId: string, livemode: boolean, opts: { from?: string; to?: string; tillId?: string }) {
    const rows = await this.prisma.reconciliationDay.findMany({
      where: {
        merchantId,
        livemode,
        ...(opts.tillId ? { tillId: opts.tillId } : {}),
        ...(opts.from || opts.to
          ? {
              entryDate: {
                ...(opts.from ? { gte: toDate(opts.from) } : {}),
                ...(opts.to ? { lte: toDate(opts.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { entryDate: 'desc' },
      take: 92, // ~3 mois max
    });
    return { object: 'list' as const, data: rows.map(presentDay) };
  }

  async getOrComputeDay(merchantId: string, date: string, livemode: boolean, tillId?: string | null) {
    const day = await this.computeDay(merchantId, date, livemode, tillId);
    return presentDay(day);
  }

  async updateDay(
    merchantId: string,
    date: string,
    livemode: boolean,
    patch: { status?: ReconciliationDayStatus; comment?: string },
    reviewerId: string,
    tillId?: string | null,
  ) {
    const day = await this.computeDay(merchantId, date, livemode, tillId);
    const updated = await this.prisma.reconciliationDay.update({
      where: { id: day.id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status, reviewedById: reviewerId, reviewedAt: new Date() } : {}),
        ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
      },
    });
    return presentDay(updated);
  }

  async importCsv(
    merchantId: string,
    date: string,
    livemode: boolean,
    csvContent: string,
    tillId?: string | null,
  ) {
    const lines = parseStatementCsv(csvContent);
    const statementAmount = lines.reduce((s, l) => s + l.amountMinor, 0n);

    const day = await this.computeDay(merchantId, date, livemode, tillId);

    // Détection automatique d'un écart entre le total AlphaPay et le relevé.
    const alphaTotal = BigInt(day.digitalAmount) + BigInt(day.cashAmount);
    const autoStatus: ReconciliationDayStatus =
      statementAmount === alphaTotal ? 'OK' : 'DISCREPANCY';

    const updated = await this.prisma.reconciliationDay.update({
      where: { id: day.id },
      data: {
        statementLines: lines.length,
        statementAmount,
        status: autoStatus,
      },
    });
    return {
      ...presentDay(updated),
      statement_parsed: lines.length,
      auto_status: autoStatus.toLowerCase(),
    };
  }
}
