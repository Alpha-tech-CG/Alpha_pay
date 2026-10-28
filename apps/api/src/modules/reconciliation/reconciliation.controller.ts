import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PrismaClient } from "@paybrain/database";
import { RequireStaffRole, STAFF_WRITE, StaffGuard } from "../staff/staff.guard";
import { ReconciliationService } from "./reconciliation.service";
import { parseStatementCsv } from "./statement-parser";
import { RunReconciliationDto } from "./dto/run-reconciliation.dto";

@Controller("internal/reconciliation")
@UseGuards(StaffGuard)
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    @Inject("PRISMA") private readonly prisma: PrismaClient,
  ) {}

  /** Relance manuelle de la réconciliation à partir d'un relevé CSV. */
  @Post("run")
  @RequireStaffRole(...STAFF_WRITE.admin)
  run(@Body() dto: RunReconciliationDto) {
    const lines = parseStatementCsv(dto.csv);
    return this.reconciliation.reconcile(
      dto.operator,
      lines,
      new Date(dto.statementDate),
    );
  }

  @Get("runs")
  listRuns() {
    return this.prisma.reconciliationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        operator: true,
        statementDate: true,
        statementLines: true,
        matchedCount: true,
        discrepancyCount: true,
        alert: true,
        createdAt: true,
      },
    });
  }

  @Get("runs/:id")
  async getRun(@Param("id") id: string) {
    const run = await this.prisma.reconciliationRun.findUnique({
      where: { id },
      include: { discrepancies: true },
    });
    if (!run) throw new NotFoundException("Run introuvable");
    return run;
  }
}
