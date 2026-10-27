import { Controller, ForbiddenException, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PrismaClient, TransactionStatus } from '@paybrain/database';
import { afterCursor, decodeCursor, page, parseLimit } from '../../common/pagination/cursor';
import { SessionGuard } from '../auth/session.guard';
import { StoresService } from '../stores/stores.service';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { presentPayment } from './payment.presenter';
import { STATUS_BY_LABEL } from './payments.controller';

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les paiements (filtres : mode, caisse, statut ; pagination par curseur)' })
  async list(
    @Param('merchantId') merchantId: string,
    @Req() req: any,
    @Query('mode') mode?: string,
    @Query('till_id') tillId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    const visible = await this.stores.visibleTillIds(merchantId, req.membership);
    if (visible !== 'all' && visible.length === 0) throw new ForbiddenException('Aucune caisse rattachée');
    if (tillId && visible !== 'all' && !visible.includes(tillId)) throw new ForbiddenException('Caisse hors de votre périmètre');

    const n = parseLimit(limit);
    const rows = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        livemode: mode === 'live',
        ...(tillId ? { tillId } : visible === 'all' ? {} : { tillId: { in: visible } }),
        ...(status ? { status: STATUS_BY_LABEL[status] ?? (status.toUpperCase() as TransactionStatus) } : {}),
        ...afterCursor(decodeCursor(startingAfter)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: n + 1,
    });
    return page(rows, n, presentPayment);
  }
}
