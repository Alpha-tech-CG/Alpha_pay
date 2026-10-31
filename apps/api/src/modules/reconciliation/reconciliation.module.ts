import { Module } from "@nestjs/common";
import { StaffModule } from "../staff/staff.module";
import { ReconciliationController } from "./reconciliation.controller";
import { ReconciliationService } from "./reconciliation.service";
import { ReconciliationCron } from "./reconciliation.cron";
import { ReconciliationReportService } from "./reconciliation-report.service";
import { MerchantReconciliationController } from "./merchant/merchant-reconciliation.controller";
import { MerchantReconciliationService } from "./merchant/merchant-reconciliation.service";
import { TeamAuthModule } from "../team/auth/team-auth.module";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  imports: [TeamAuthModule, StaffModule, MessagingModule],
  controllers: [ReconciliationController, MerchantReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationCron,
    ReconciliationReportService,
    MerchantReconciliationService,
  ],
})
export class ReconciliationModule {}
