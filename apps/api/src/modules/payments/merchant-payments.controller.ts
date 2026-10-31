import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateRefundDto } from './dto/create-payment.dto';
import { presentRefund, RefundsService } from './refunds.service';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PrismaClient, TransactionStatus } from '@paybrain/database';
import { afterCursor, decodeCursor, page, parseLimit } from '../../common/pagination/cursor';
import { SessionGuard } from '../auth/session.guard';
import { StoresService } from '../stores/stores.service';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { presentPayment } from './payment.presenter';
import { STATUS_BY_LABEL } from './payments.controller';
import { formatAmount, toMajorAmount } from '../../common/money';
import { windowStart } from '../stats/merchant-stats.service';
import { can } from '../team/permissions/permissions';

/**
 * Paiements vus depuis le tableau de bord (§M1, §M6). Le périmètre dépend du
 * rôle, appliqué CÔTÉ SERVEUR : propriétaire, administrateur et comptable
 * voient tout ; un caissier ne voit QUE les paiements de ses caisses.
 */
@ApiTags('Paiements (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/payments')
@UseGuards(SessionGuard, RequireMemberGuard)
export class MerchantPaymentsController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly stores: StoresService,
    private readonly refunds: RefundsService,
  ) {}

  /** Remboursement depuis le tableau de bord : propriétaire et administrateur seulement. */
  @Post(':txId/refunds')
  @HttpCode(201)
  @ApiOperation({ summary: 'Rembourser un paiement réussi (carte : par l’acquéreur ; Mobile Money : déclaration)' })
  async refund(@Param('txId', ParseUUIDPipe) txId: string, @Query('mode') mode: string | undefined, @Body() dto: CreateRefundDto, @Req() req: any) {
    if (!can(req.membership.role, 'payments:refund')) throw new ForbiddenException('Remboursement réservé au propriétaire et aux administrateurs');
    const refund = await this.refunds.create(txId, req.membership.merchantId, mode === 'live', dto, { type: 'user', id: req.appUser.id, ip: req.ip });
    return presentRefund(refund);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les paiements (filtres : mode, caisse, statut, opérateur, dates, recherche ; pagination par curseur)' })
  async list(
    @Param('merchantId') _merchantId: string,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('till_id') tillId?: string,
    @Query('status') status?: string,
    @Query('operator') operator?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    const { merchantId } = req.membership;
    const visible = await this.stores.visibleTillIds(merchantId, req.membership);
    if (visible !== 'all' && visible.length === 0) throw new ForbiddenException('Aucune caisse rattachée');
    if (tillId && visible !== 'all' && !visible.includes(tillId)) throw new ForbiddenException('Caisse hors de votre périmètre');

    const n = parseLimit(limit);

    const dateFilter =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {};

    const searchFilter = q
      ? { OR: [{ externalId: { contains: q } }, { mtnReferenceId: { contains: q } }] }
      : {};

    const rows = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        livemode: mode === 'live',
        ...(tillId ? { tillId } : visible === 'all' ? {} : { tillId: { in: visible } }),
        ...(status ? { status: STATUS_BY_LABEL[status] ?? (status.toUpperCase() as TransactionStatus) } : {}),
        ...(operator ? { operator: operator.toUpperCase() as any } : {}),
        ...dateFilter,
        ...searchFilter,
        ...afterCursor(decodeCursor(startingAfter)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: n + 1,
    });
    return page(rows, n, presentPayment);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totaux du jour/semaine/mois pour le tableau de bord Paiements' })
  async summary(
    @Param('merchantId') _merchantId: string,
    @Query('mode') mode: string,
    @Req() req: any,
  ) {
    const { merchantId, role } = req.membership;
    // Totaux de tout le marchand : un caissier ne voit que sa caisse (§M1).
    if (!can(role, 'payments:view')) throw new ForbiddenException('Totaux réservés aux gestionnaires');
    const livemode = mode === 'live';
    const todayStart = windowStart('day');

    const [today, allTime] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { merchantId, livemode, status: 'SUCCEEDED', createdAt: { gte: todayStart } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { merchantId, livemode, status: 'SUCCEEDED' },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    const fmt = (v: bigint | null) => ({ amount: v != null ? toMajorAmount(v, 'XAF') : 0, display: v != null ? formatAmount(v, 'XAF') : '0 XAF' });
    return {
      today: { count: today._count.id, ...fmt(today._sum.amount) },
      all_time: { count: allTime._count.id, ...fmt(allTime._sum.amount) },
    };
  }

  @Get(':txId')
  @ApiOperation({ summary: 'Détail d\'un paiement avec son journal d\'audit' })
  async detail(
    @Param('merchantId') _merchantId: string,
    @Param('txId', ParseUUIDPipe) txId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    const visible = await this.stores.visibleTillIds(merchantId, req.membership);

    const tx = await this.prisma.transaction.findFirst({
      where: { id: txId, merchantId },
      include: { audits: { orderBy: { createdAt: 'asc' } }, refunds: { orderBy: { createdAt: 'asc' } }, disputes: { orderBy: { createdAt: 'asc' } } },
    });
    if (!tx) throw new NotFoundException('Paiement introuvable');

    if (visible !== 'all' && tx.tillId && !visible.includes(tx.tillId)) {
      throw new ForbiddenException('Paiement hors de votre périmètre');
    }

    return {
      ...presentPayment(tx),
      refunds: tx.refunds.map(presentRefund),
      disputes: tx.disputes.map((d) => ({ id: d.id, status: d.status, reason: d.reason, amount: toMajorAmount(d.amount, d.currency), evidence_due_at: d.evidenceDueAt, created_at: d.createdAt })),
      can_refund: tx.status === 'SUCCEEDED' && tx.amountRefunded < tx.amount && can(req.membership.role, 'payments:refund'),
      audit_trail: tx.audits.map((a) => ({
        from: a.fromStatus,
        to: a.toStatus,
        reason: a.reason,
        at: a.createdAt,
      })),
    };
  }
}
