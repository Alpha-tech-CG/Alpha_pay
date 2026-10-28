import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient, ExportFormat } from '@paybrain/database';
import { JobQueue, QUEUES } from '../../common/queue/job-queue';
import { FileStorage, fileStorageFromEnv } from '../../common/storage/file-storage';
import { toMajorAmount } from '../../common/money';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import ExcelJS from 'exceljs';

const EXPORT_URL_TTL_S = 3600; // 1 h

export interface ExportFilters {
  /** Date de début (ISO 8601, partie date). */
  date_from?: string;
  date_to?: string;
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

const TX_HEADERS = ['ID', 'Date', 'Statut', 'Opérateur', 'Montant', 'Devise', 'Référence', 'Caisse', 'Téléphone'];

function txToRow(tx: any) {
  return [
    tx.id,
    tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
    tx.status,
    tx.operator,
    toMajorAmount(tx.amount, tx.currency),
    tx.currency,
    tx.externalId,
    tx.tillId ?? '',
    tx.payerPhoneMask ?? '',
  ];
}

@Injectable()
export class ExportsService implements OnModuleInit {
  private readonly logger = new Logger(ExportsService.name);
  private readonly storage: FileStorage = fileStorageFromEnv();

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject('JOB_QUEUE') private readonly queue: JobQueue,
  ) {}

  onModuleInit() {
    this.queue.process<ExportJobPayload>(QUEUES.exports, (data) => this.processExport(data));
  }

  async createJob(
    merchantId: string,
    memberId: string,
    livemode: boolean,
    format: ExportFormat,
    filters: ExportFilters,
  ) {
    const job = await this.prisma.exportJob.create({
      data: { merchantId, requestedBy: memberId, livemode, format, filters: filters as any },
    });

    await this.queue.enqueue<ExportJobPayload>(
      QUEUES.exports,
      'generate-export',
      { jobId: job.id, merchantId, livemode, format, filters },
      { jobId: job.id, attempts: 3 },
    );

    return { id: job.id, status: 'pending' };
  }

  async getJob(jobId: string, merchantId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, merchantId } });
    if (!job) return null;

    // Régénère l'URL signée si expirée.
    if (job.status === 'DONE' && job.fileKey && (!job.urlExpiresAt || job.urlExpiresAt < new Date())) {
      const url = await this.signedUrl(job.fileKey, job.format);
      const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_S * 1000);
      await this.prisma.exportJob.update({ where: { id: jobId }, data: { downloadUrl: url, urlExpiresAt: expiresAt } });
      return { ...job, downloadUrl: url, urlExpiresAt: expiresAt };
    }
    return job;
  }

  async listJobs(merchantId: string) {
    return this.prisma.exportJob.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, status: true, format: true, rowCount: true, downloadUrl: true, urlExpiresAt: true, createdAt: true, completedAt: true },
    });
  }

  // ─── Worker ─────────────────────────────────────────────────────────────────

  private async processExport(data: ExportJobPayload) {
    const { jobId, merchantId, livemode, format, filters } = data;

    await this.prisma.exportJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } });

    try {
      const rows = await this.fetchRows(merchantId, livemode, filters);
      const tmpPath = join(tmpdir(), `ap-export-${randomBytes(8).toString('hex')}.${format.toLowerCase()}`);

      if (format === 'CSV') {
        await this.writeCsv(tmpPath, rows);
      } else {
        await this.writeXlsx(tmpPath, rows);
      }

      const { readFile } = await import('fs/promises');
      const buf = await readFile(tmpPath);
      const fileKey = `exports/${merchantId}/${jobId}.${format.toLowerCase()}`;
      await this.storage.put(fileKey, buf);
      await rm(tmpPath, { force: true });

      const url = await this.signedUrl(fileKey, format);
      const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_S * 1000);

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          rowCount: rows.length,
          fileKey,
          downloadUrl: url,
          urlExpiresAt: expiresAt,
          completedAt: new Date(),
        },
      });
      this.logger.log(`Export ${jobId} terminé : ${rows.length} lignes`);
    } catch (err: any) {
      this.logger.error(`Export ${jobId} échoué : ${err?.message}`);
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: String(err?.message ?? err) },
      });
    }
  }

  private async fetchRows(merchantId: string, livemode: boolean, f: ExportFilters) {
    const rows = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        livemode,
        ...(f.status ? { status: f.status.toUpperCase() as any } : {}),
        ...(f.operator ? { operator: f.operator.toUpperCase() as any } : {}),
        ...(f.till_id ? { tillId: f.till_id } : {}),
        ...(f.date_from || f.date_to
          ? {
              createdAt: {
                ...(f.date_from ? { gte: new Date(f.date_from) } : {}),
                ...(f.date_to ? { lte: new Date(f.date_to + 'T23:59:59.999Z') } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: { id: true, status: true, operator: true, amount: true, currency: true, externalId: true, tillId: true, payerPhoneMask: true, createdAt: true },
    });
    return rows;
  }

  private async writeCsv(path: string, rows: any[]): Promise<void> {
    const { writeFile } = await import('fs/promises');
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [TX_HEADERS.map(escape).join(',')];
    for (const row of rows) {
      lines.push(txToRow(row).map(escape).join(','));
    }
    await writeFile(path, '﻿' + lines.join('\r\n'), 'utf8'); // BOM pour Excel
  }

  private async writeXlsx(path: string, rows: any[]): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AlphaPay';
    const ws = wb.addWorksheet('Transactions');

    ws.columns = TX_HEADERS.map((h) => ({ header: h, width: 22 }));
    ws.getRow(1).font = { bold: true };

    for (const row of rows) {
      ws.addRow(txToRow(row));
    }

    await wb.xlsx.writeFile(path);
  }

  private async signedUrl(fileKey: string, format: ExportFormat): Promise<string> {
    // Pour l'instant : URL relative à l'API (le contrôleur sert le fichier via storage).
    // En prod S3 : remplacer par une pre-signed URL S3.
    const ext = format === 'CSV' ? 'csv' : 'xlsx';
    return `/v1/internal/exports/download/${encodeURIComponent(fileKey)}?ext=${ext}`;
  }
}
