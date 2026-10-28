import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, ReconciliationDayStatus } from '@paybrain/database';
import { formatAmount, toMajorAmount } from '../../../common/money';
import { parseStatementCsv } from '../statement-parser';

function toDate(d: string): Date {
  return new Date(d + 'T00:00:00.000Z');
}

function endOfDate(d: string): Date {
  return new Date(d + 'T23:59:59.999Z');
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
          createdAt: { gte: toDate(date), lte: endOfDate(date) },
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
