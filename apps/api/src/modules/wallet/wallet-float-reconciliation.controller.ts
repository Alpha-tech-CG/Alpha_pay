import { Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { InternalGuard } from '../../common/guards/internal.guard';
import { WalletFloatReconciliationService } from './wallet-float-reconciliation.service';

/**
 * Administration de la réconciliation float wallet (ALP-175).
 * Protégé par InternalGuard (réseau interne uniquement).
 */
@Controller('internal/wallet-reconciliation')
@UseGuards(InternalGuard)
export class WalletFloatReconciliationController {
  constructor(
    private readonly service: WalletFloatReconciliationService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  /** Lance la réconciliation à la demande. */
  @Post('run')
  run() {
    return this.service.run();
  }

  /** Derniers runs (pour le dashboard admin). */
  @Get('runs')
  listRuns() {
    return this.prisma.walletReconciliationRun.findMany({
      orderBy: { runDate: 'desc' },
      take: 50,
    });
  }
}
