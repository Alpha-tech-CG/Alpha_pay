import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, ExportFormat, TransactionStatus } from '@paybrain/database';
import { PUBLIC_PAYMENT_STATUS, publicPaymentStatus } from '@paybrain/shared';
import { JobQueue, QUEUES } from '../../common/queue/job-queue';
import { FileStorage, fileStorageFromEnv } from '../../common/storage/file-storage';
import { toMajorAmount } from '../../common/money';
import ExcelJS from 'exceljs';

export const EXPORT_MAX_ROWS = 10_000;

export type ExportKind = 'transactions' | 'reconciliation';

export interface ExportFilters {
  /** Contenu exporté (§M6) : transactions (défaut) ou rapprochement journalier. */
  kind?: ExportKind;
  /** Date de début (ISO 8601, partie date). */
  date_from?: string;
  date_to?: string;
  /** Statut public (§M3) : en_attente, réussi, échoué, expiré, annulé. */
  status?: string;
  operator?: string;
  till_id?: string;
}

interface ExportJobPayload {
  jobId: string;
  merchantId: string;
  livemode: boolean;
  format: ExportFormat;
  filters: ExportFilters;
}

type Cell = string | number;

const TX_HEADERS = ['ID', 'Date', 'Statut', 'Opérateur', 'Montant', 'Devise', 'Référence', 'Caisse', 'Téléphone'];
const RECON_HEADERS = ['Date', 'Caisse', 'Statut', 'Paiements', 'Montant numérique', 'Cash déclaré', 'Relevé', 'Devise', 'Commentaire'];

const STATUS_BY_LABEL = Object.fromEntries(Object.entries(PUBLIC_PAYMENT_STATUS).map(([k, v]) => [v, k])) as Record<string, TransactionStatus>;
const RECON_STATUS: Record<string, string> = { PENDING: 'non_rapproché', OK: 'rapproché', DISCREPANCY: 'écart' };

/**
 * Neutralise l'injection de formules (CSV/Excel) : une cellule texte qui
 * commence par = + - @ serait exécutée par le tableur à l'ouverture.
 */
export function safeCell(value: Cell): Cell {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function dateRange(f: ExportFilters) {
  if (!f.date_from && !f.date_to) return undefined;
  return {
    ...(f.date_from ? { gte: new Date(f.date_from) } : {}),
    ...(f.date_to ? { lte: new Date(f.date_to + 'T23:59:59.999Z') } : {}),
  };
}

/**
 * Exports CSV et Excel (§M6, T-73). L'API ne fait que déposer la tâche ; le
 * worker produit le fichier (10 000 lignes sans bloquer l'interface) et le
 * range dans le stockage. Le téléchargement passe par la route authentifiée
 * du tableau de bord, jamais par une URL publique.
 */
@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly storage: FileStorage = fileStorageFromEnv();

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(JobQueue) private readonly queue: JobQueue,
  ) {}

  /** Appelé par le worker seulement (D-008). */
  register(): void {
    this.queue.process<ExportJobPayload>(QUEUES.exports, (data) => this.processExport(data));
  }

  async createJob(merchantId: string, memberId: string, livemode: boolean, format: ExportFormat, filters: ExportFilters) {
    const job = await this.prisma.exportJob.create({
      data: { merchantId, requestedBy: memberId, livemode, format, filters: filters as any },
    });
    await this.queue.enqueue<ExportJobPayload>(
      QUEUES.exports,
      'generate-export',
      { jobId: job.id, merchantId, livemode, format, filters },
      { jobId: job.id, attempts: 3 },
    );
    return this.present(job);
  }

  async getJob(jobId: string, merchantId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, merchantId } });
    return job ? this.present(job) : null;
  }

  async listJobs(merchantId: string) {
    const jobs = await this.prisma.exportJob.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { object: 'list', data: jobs.map((j) => this.present(j)) };
  }

  /** Fichier d'un export terminé (route authentifiée du tableau de bord). */
  async download(jobId: string, merchantId: string): Promise<{ filename: string; contentType: string; body: Buffer } | null> {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, merchantId, status: 'DONE' } });
    if (!job?.fileKey) return null;
    const kind = (job.filters as ExportFilters)?.kind ?? 'transactions';
    const ext = job.format === 'CSV' ? 'csv' : 'xlsx';
    return {
      filename: `alphapay-${kind}-${job.createdAt.toISOString().slice(0, 10)}.${ext}`,
      contentType: job.format === 'CSV' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: await this.storage.get(job.fileKey),
    };
  }

  private present(job: { id: string; status: string; format: ExportFormat; filters: unknown; livemode: boolean; rowCount: number | null; error: string | null; createdAt: Date; completedAt: Date | null }) {
    return {
      id: job.id,
      object: 'export',
      livemode: job.livemode,
      kind: (job.filters as ExportFilters)?.kind ?? 'transactions',
      format: job.format,
      status: job.status.toLowerCase(),
      row_count: job.rowCount,
      truncated: job.rowCount === EXPORT_MAX_ROWS,
      error: job.status === 'FAILED' ? 'Export échoué, relancez-le' : null,
      created_at: job.createdAt,
      completed_at: job.completedAt,
    };
  }

  // ─── Worker ─────────────────────────────────────────────────────────────────

  async processExport(data: ExportJobPayload) {
    const { jobId, merchantId, livemode, format, filters } = data;
    await this.prisma.exportJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } });
    try {
      const { headers, rows, sheet } =
        filters.kind === 'reconciliation'
          ? { headers: RECON_HEADERS, rows: await this.reconciliationRows(merchantId, livemode, filters), sheet: 'Rapprochement' }
          : { headers: TX_HEADERS, rows: await this.transactionRows(merchantId, livemode, filters), sheet: 'Transactions' };
      const body = format === 'CSV' ? this.csv(headers, rows) : await this.xlsx(sheet, headers, rows);
      const fileKey = `exports/${merchantId}/${jobId}.${format === 'CSV' ? 'csv' : 'xlsx'}`;
      await this.storage.put(fileKey, body);
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'DONE', rowCount: rows.length, fileKey, completedAt: new Date() },
      });
      this.logger.log(`Export ${jobId} terminé : ${rows.length} lignes`);
    } catch (err: any) {
      this.logger.error(`Export ${jobId} échoué : ${err?.message}`);
      await this.prisma.exportJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: String(err?.message ?? err) } });
    }
  }

  private async tillNames(merchantId: string): Promise<Map<string, string>> {
    const tills = await this.prisma.till.findMany({ where: { merchantId }, select: { id: true, name: true, store: { select: { name: true } } } });
    return new Map(tills.map((t) => [t.id, `${t.store.name} · ${t.name}`]));
  }

  private async transactionRows(merchantId: string, livemode: boolean, f: ExportFilters): Promise<Cell[][]> {
    const createdAt = dateRange(f);
    const txs = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        livemode,
        ...(f.status ? { status: STATUS_BY_LABEL[f.status] ?? (f.status.toUpperCase() as TransactionStatus) } : {}),
        ...(f.operator ? { operator: f.operator.toUpperCase() as any } : {}),
        ...(f.till_id ? { tillId: f.till_id } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX_ROWS,
      select: { id: true, status: true, operator: true, amount: true, currency: true, externalId: true, tillId: true, payerPhoneMask: true, createdAt: true },
    });
    const tills = await this.tillNames(merchantId);
    return txs.map((tx) => [
      tx.id,
      tx.createdAt.toISOString(),
      publicPaymentStatus(tx.status),
      String(tx.operator ?? '').toLowerCase(),
      toMajorAmount(tx.amount, tx.currency),
      tx.currency,
      tx.externalId,
      tx.tillId ? (tills.get(tx.tillId) ?? tx.tillId) : '',
      tx.payerPhoneMask ?? '',
    ]);
  }

  private async reconciliationRows(merchantId: string, livemode: boolean, f: ExportFilters): Promise<Cell[][]> {
    const entryDate = dateRange(f);
    const days = await this.prisma.reconciliationDay.findMany({
      where: { merchantId, livemode, ...(f.till_id ? { tillId: f.till_id } : {}), ...(entryDate ? { entryDate } : {}) },
      orderBy: [{ entryDate: 'desc' }, { tillId: 'asc' }],
      take: EXPORT_MAX_ROWS,
    });
    const tills = await this.tillNames(merchantId);
    return days.map((d) => [
      d.entryDate.toISOString().slice(0, 10),
      d.tillId ? (tills.get(d.tillId) ?? d.tillId) : 'Toutes les caisses',
      RECON_STATUS[d.status] ?? d.status,
      d.digitalCount,
      toMajorAmount(d.digitalAmount, d.currency),
      toMajorAmount(d.cashAmount, d.currency),
      d.statementAmount != null ? toMajorAmount(d.statementAmount, d.currency) : '',
      d.currency,
      d.comment ?? '',
    ]);
  }

  private csv(headers: string[], rows: Cell[][]): Buffer {
    const escape = (v: Cell) => {
      const s = String(safeCell(v) ?? '');
      return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8'); // BOM : accents lisibles dans Excel
  }

  private async xlsx(sheet: string, headers: string[], rows: Cell[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AlphaPay';
    const ws = wb.addWorksheet(sheet);
    ws.columns = headers.map((h) => ({ header: h, width: 22 }));
    ws.getRow(1).font = { bold: true };
    for (const row of rows) ws.addRow(row.map(safeCell));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
