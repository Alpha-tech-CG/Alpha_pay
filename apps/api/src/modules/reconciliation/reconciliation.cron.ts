import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ReconciliationService } from "./reconciliation.service";
import { parseStatementCsv } from "./statement-parser";
import { readFile, readdir, rename } from "fs/promises";
import { join } from "path";

/**
 * Réconciliation automatique quotidienne (ALP-140).
 *
 * Source des relevés : répertoire `RECONCILIATION_INBOX` où l'intégration
 * opérateur (API/SFTP — MTN, Airtel ou banque) dépose des fichiers
 * `<OPERATOR>_<YYYY-MM-DD>.csv`. Sans répertoire configuré, le job est un no-op
 * journalisé (le pilote utilise l'endpoint manuel POST /internal/reconciliation/run).
 */
@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(private readonly reconciliation: ReconciliationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDaily() {
    const inbox = process.env.RECONCILIATION_INBOX;
    if (!inbox) {
      this.logger.log(
        "RECONCILIATION_INBOX non configuré — réconciliation auto ignorée (utiliser l'endpoint manuel).",
      );
      return;
    }

    let files: string[];
    try {
      files = (await readdir(inbox)).filter((f) => /\.csv$/i.test(f));
    } catch (err: any) {
      this.logger.error(
        `Lecture du répertoire ${inbox} impossible: ${err?.message}`,
      );
      return;
    }

    for (const file of files) {
      const m = /^(MTN|AIRTEL|BANK)_(\d{4}-\d{2}-\d{2})\.csv$/i.exec(file);
      if (!m) {
        this.logger.warn(
          `Fichier ignoré (nommage attendu <OPERATOR>_<YYYY-MM-DD>.csv): ${file}`,
        );
        continue;
      }
      const operator = m[1].toUpperCase() as "MTN" | "AIRTEL" | "BANK";
      try {
        const content = await readFile(join(inbox, file), "utf8");
        const lines = parseStatementCsv(content);
        await this.reconciliation.reconcile(operator, lines, new Date(m[2]));
        await rename(join(inbox, file), join(inbox, `processed_${file}`)).catch(
          () => undefined,
        );
      } catch (err: any) {
        this.logger.error(`Échec réconciliation ${file}: ${err?.message}`);
      }
    }
  }
}
