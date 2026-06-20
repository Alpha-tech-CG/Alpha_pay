import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaClient } from "@paybrain/database";
import { SettlementService } from "./settlement.service";

/**
 * Reversement automatique quotidien (ALP-141). Pour chaque marchand dont la
 * configuration correspond au jour (fréquence/jour de semaine), calcule la
 * période et crée un batch.
 */
@Injectable()
export class SettlementCron {
  private readonly logger = new Logger(SettlementCron.name);

  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly settlement: SettlementService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDaily() {
    const configs = await this.prisma.merchantSettlementConfig.findMany({
      where: { enabled: true },
    });
    const now = new Date();
    const today = now.getUTCDay() === 0 ? 7 : now.getUTCDay(); // 1=lundi..7=dimanche

    for (const config of configs) {
      // WEEKLY : seulement le bon jour ; sinon (T1/T2/DAILY) tous les jours.
      if (config.frequency === "WEEKLY" && config.dayOfWeek !== today) continue;

      const offsetDays = config.frequency === "T2" ? 2 : 1;
      const periodEnd = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - offsetDays + 1,
        ),
      );
      const span = config.frequency === "WEEKLY" ? 7 : 1;
      const periodStart = new Date(
        periodEnd.getTime() - span * 24 * 3600 * 1000,
      );

      try {
        const res = await this.settlement.run(
          config.merchantId,
          periodStart,
          periodEnd,
        );
        if (res.created)
          this.logger.log(
            `Settlement auto ${res.batchNumber} pour ${config.merchantId}`,
          );
      } catch (err: any) {
        this.logger.error(
          `Settlement auto échoué pour ${config.merchantId}: ${err?.message}`,
        );
      }
    }
  }
}
