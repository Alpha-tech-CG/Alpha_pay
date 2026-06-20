import { Module } from "@nestjs/common";
import { ReconciliationController } from "./reconciliation.controller";
import { ReconciliationService } from "./reconciliation.service";
import { ReconciliationCron } from "./reconciliation.cron";
import { ReconciliationReportService } from "./reconciliation-report.service";

@Module({
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationCron,
    ReconciliationReportService,
  ],
})
export class ReconciliationModule {}
