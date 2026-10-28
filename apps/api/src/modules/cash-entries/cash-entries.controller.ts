import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@paybrain/database';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { can } from '../team/permissions/permissions';
import { formatAmount, toMajorAmount } from '../../common/money';
import { CreateCashEntryDto } from './create-cash-entry.dto';

function presentEntry(e: any) {
  return {
    id: e.id,
    object: 'cash_entry',
    livemode: e.livemode,
    amount: toMajorAmount(e.amount, e.currency),
    amount_display: formatAmount(e.amount, e.currency),
    currency: e.currency,
    till_id: e.tillId ?? null,
    member_id: e.memberId,
    note: e.note ?? null,
    entry_date: e.entryDate instanceof Date ? e.entryDate.toISOString().slice(0, 10) : e.entryDate,
    created_at: e.createdAt,
  };
}

/**
 * Cash déclaré manuellement (§M6, T-71). Un caissier déclare le cash qu'il a
 * comptabilisé en dehors des encaissements numériques. Ces entrées complètent
 * le rapprochement journalier.
 */
@ApiTags('Cash déclaré (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/cash-entries')
@UseGuards(SessionGuard, RequireMemberGuard)
export class CashEntriesController {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Déclarer du cash' })
  async create(
    @Param('merchantId') _merchantId: string,
    @Body() dto: CreateCashEntryDto,
    @Req() req: any,
  ) {
    const { merchantId, memberId, role } = req.membership;
    if (!can(role, 'cash:declare')) throw new ForbiddenException('Rôle insuffisant pour déclarer du cash');

    const livemode = false; // cash toujours en mode test sauf si explicitement demandé
    const entry = await this.prisma.cashEntry.create({
      data: {
        merchantId,
        memberId,
        tillId: dto.till_id ?? null,
        amount: BigInt(dto.amount),
        currency: dto.currency ?? 'XAF',
        livemode,
        note: dto.note ?? null,
        entryDate: dto.entry_date ? new Date(dto.entry_date) : new Date(),
      },
    });
    return presentEntry(entry);
  }

  @Get()
  @ApiOperation({ summary: 'Lister le cash déclaré (filtre : date, caisse)' })
  async list(
    @Param('merchantId') _merchantId: string,
    @Req() req: any,
    @Query('date') date?: string,
    @Query('till_id') tillId?: string,
    @Query('mode') mode?: string,
  ) {
    const { merchantId, memberId, role } = req.membership;
    const livemode = mode === 'live';

    // Un caissier ne voit que ses propres entrées.
    const memberFilter = can(role, 'payments:view') ? {} : { memberId };

    const entries = await this.prisma.cashEntry.findMany({
      where: {
        merchantId,
        livemode,
        ...(tillId ? { tillId } : {}),
        ...(date ? { entryDate: new Date(date) } : {}),
        ...memberFilter,
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return { object: 'list', data: entries.map(presentEntry) };
  }

  @Delete(':entryId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une entrée (auteur ou admin/propriétaire)' })
  async remove(
    @Param('merchantId') _merchantId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Req() req: any,
  ): Promise<void> {
    const { merchantId, memberId, role } = req.membership;

    const entry = await this.prisma.cashEntry.findFirst({ where: { id: entryId, merchantId } });
    if (!entry) throw new NotFoundException('Entrée introuvable');

    const isOwnerOrAdmin = can(role, 'payments:view');
    if (!isOwnerOrAdmin && entry.memberId !== memberId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres entrées');
    }

    await this.prisma.cashEntry.delete({ where: { id: entryId } });
  }
}
