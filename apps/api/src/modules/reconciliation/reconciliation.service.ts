import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  Operator,
  PrismaClient,
  ReconciliationDiscrepancyType,
} from "@paybrain/database";
import { StatementLine } from "./statement-parser";
import { NotificationService } from "../notifications/notification.service";
import { ReconciliationReportService } from "./reconciliation-report.service";

// Seuil d'alerte P1 : 100 000 FCFA = 10 000 000 centimes (ALP-140).
const ALERT_THRESHOLD_CENTS = 100_000n * 100n;

interface DiscrepancyDraft {
  type: ReconciliationDiscrepancyType;
  reference: string;
  ledgerAmount: bigint | null;
  statementAmount: bigint | null;
  details?: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly reports?: ReconciliationReportService,
  ) {}

  /**
   * Rapproche un relevé opérateur du ledger interne pour une date donnée.
   * Détecte : doublons relevé, lignes relevé absentes du ledger, montants
   * divergents, transactions ledger absentes du relevé. Persiste un run + ses
   * écarts, lève une alerte si un écart dépasse le seuil P1.
   */
  async reconcile(
    operator: Operator,
    statementLines: StatementLine[],
    statementDate: Date,
  ) {
    const dayStart = new Date(
      Date.UTC(
        statementDate.getUTCFullYear(),
        statementDate.getUTCMonth(),
        statementDate.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    // Transactions encaissées (SUCCESSFUL) de l'opérateur pour la journée.
    const txns = await this.prisma.transaction.findMany({
      where: {
        operator,
        status: "SUCCESSFUL",
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        mtnReferenceId: true,
        externalId: true,
        amount: true,
      },
    });

    const txByRef = new Map<string, { amount: bigint; matched: boolean }>();
    for (const t of txns) {
      if (t.mtnReferenceId)
        txByRef.set(t.mtnReferenceId, { amount: t.amount, matched: false });
      txByRef.set(t.externalId, { amount: t.amount, matched: false });
    }

    const discrepancies: DiscrepancyDraft[] = [];
    const seenRefs = new Set<string>();
    let totalStatement = 0n;

    for (const line of statementLines) {
      totalStatement += line.amountCents;

      if (seenRefs.has(line.reference)) {
        discrepancies.push({
          type: "DUPLICATE",
          reference: line.reference,
          ledgerAmount: null,
          statementAmount: line.amountCents,
          details: "Référence dupliquée dans le relevé",
        });
        continue;
      }
      seenRefs.add(line.reference);

      const tx = txByRef.get(line.reference);
      if (!tx) {
        discrepancies.push({
          type: "STATEMENT_NOT_IN_LEDGER",
          reference: line.reference,
          ledgerAmount: null,
          statementAmount: line.amountCents,
          details: "Ligne du relevé sans transaction correspondante",
        });
        continue;
      }

      tx.matched = true;
      if (tx.amount !== line.amountCents) {
        discrepancies.push({
          type: "AMOUNT_MISMATCH",
          reference: line.reference,
          ledgerAmount: tx.amount,
          statementAmount: line.amountCents,
          details: `Ledger ${tx.amount} vs relevé ${line.amountCents} (centimes)`,
        });
      }
    }

    // Transactions du ledger jamais rapprochées par une ligne du relevé.
    let totalLedger = 0n;
    const countedTxIds = new Set<string>();
    for (const t of txns) {
      if (countedTxIds.has(t.id)) continue;
      countedTxIds.add(t.id);
      totalLedger += t.amount;
      const byMtn = t.mtnReferenceId
        ? txByRef.get(t.mtnReferenceId)
        : undefined;
      const byExt = txByRef.get(t.externalId);
      const matched = (byMtn?.matched ?? false) || (byExt?.matched ?? false);
      if (!matched) {
        discrepancies.push({
          type: "LEDGER_NOT_IN_STATEMENT",
          reference: t.mtnReferenceId ?? t.externalId,
          ledgerAmount: t.amount,
          statementAmount: null,
          details: "Transaction encaissée absente du relevé opérateur",
        });
      }
    }

    const maxDiscrepancy = discrepancies.reduce((max, d) => {
      const v = (d.ledgerAmount ?? 0n) - (d.statementAmount ?? 0n);
      const abs = v < 0n ? -v : v;
      const cand = abs > 0n ? abs : (d.statementAmount ?? d.ledgerAmount ?? 0n);
      return cand > max ? cand : max;
    }, 0n);

    const matchedCount =
      statementLines.length -
      discrepancies.filter(
        (d) => d.type === "STATEMENT_NOT_IN_LEDGER" || d.type === "DUPLICATE",
      ).length;
    const alert = maxDiscrepancy > ALERT_THRESHOLD_CENTS;

    const report = {
      operator,
      statementDate: dayStart.toISOString().slice(0, 10),
      statementLines: statementLines.length,
      ledgerTransactions: txns.length,
      matchedCount,
      discrepancyCount: discrepancies.length,
      totalStatement: totalStatement.toString(),
      totalLedger: totalLedger.toString(),
      maxDiscrepancy: maxDiscrepancy.toString(),
      alert,
      discrepancies: discrepancies.map((d) => ({
        ...d,
        ledgerAmount: d.ledgerAmount?.toString() ?? null,
        statementAmount: d.statementAmount?.toString() ?? null,
      })),
    };

    const run = await this.prisma.reconciliationRun.create({
      data: {
        operator,
        statementDate: dayStart,
        statementLines: statementLines.length,
        matchedCount,
        discrepancyCount: discrepancies.length,
        totalStatement,
        totalLedger,
        maxDiscrepancy,
        alert,
        reportJson: report as any,
        discrepancies: {
          create: discrepancies.map((d) => ({
            type: d.type,
            reference: d.reference,
            ledgerAmount: d.ledgerAmount,
            statementAmount: d.statementAmount,
            details: d.details,
          })),
        },
      },
    });

    const archived = this.reports
      ? await this.reports.archive(run.id, report)
      : null;
    if (archived) {
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          reportJsonKey: archived.jsonKey,
          reportPdfKey: archived.pdfKey,
          archivedAt: new Date(),
        },
      });
    }

    if (alert) {
      this.logger.error(
        `ALERTE P1 réconciliation ${operator} ${report.statementDate} : écart max ${maxDiscrepancy} centimes (run ${run.id})`,
      );
      // Alerte ops par email (ALP-143).
      await this.notifications.send({
        channel: "EMAIL",
        to: process.env.OPS_EMAIL ?? "ops@paybrain.cg",
        template: "reconciliation.alert",
        category: "reconciliation_alert",
        data: {
          operator,
          date: report.statementDate,
          maxDiscrepancy: maxDiscrepancy.toString(),
          discrepancyCount: discrepancies.length,
          runId: run.id,
        },
      });
    } else {
      this.logger.log(
        `Réconciliation ${operator} ${report.statementDate} : ${discrepancies.length} écart(s) (run ${run.id})`,
      );
    }

    await this.notifications.send({
      channel: "EMAIL",
      to: process.env.OPS_EMAIL ?? "ops@paybrain.cg",
      template: "reconciliation.summary",
      category: "reconciliation_summary",
      data: {
        operator,
        date: report.statementDate,
        matchedCount,
        discrepancyCount: discrepancies.length,
        runId: run.id,
      },
    });

    return { runId: run.id, ...report, archived };
  }
}
