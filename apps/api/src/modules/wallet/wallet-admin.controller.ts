import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, PrismaClient, WalletStatus } from '@paybrain/database';
import { InternalGuard } from '../../common/guards/internal.guard';
import { ActivateWalletDto, AttachCashierDto, WalletActionDto } from './dto/wallet-admin.dto';

// Back-office ops : revue et validation manuelle des wallets clients
// (closed-loop e-money). Protégé par le jeton interne, jamais exposé publiquement.
//
// Le modèle Prisma est `Wallet` (WalletStatus = PENDING_VERIFICATION | ACTIVE |
// SUSPENDED | CLOSED). Le back-office parle de « bloquer » : cela correspond au
// statut SUSPENDED. Il n'existe pas (encore) de table d'audit dédiée aux wallets,
// donc l'officer + le motif sont journalisés (comme KycService), en attendant un
// modèle WalletAuditEvent qui nécessiterait une migration.
@Controller('internal/wallets')
@UseGuards(InternalGuard)
export class WalletAdminController {
  private readonly logger = new Logger(WalletAdminController.name);

  private static readonly LIST_SELECT = {
    id: true,
    phone: true,
    fullName: true,
    status: true,
    balanceCents: true,
    kycLevel: true,
    createdAt: true,
  } satisfies Prisma.WalletSelect;

  private static readonly VALID_STATUS: WalletStatus[] = [
    'PENDING_VERIFICATION',
    'ACTIVE',
    'SUSPENDED',
    'CLOSED',
  ];

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('phone') phone?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    const pageNum = Math.max(Number.parseInt(page ?? '1', 10) || 1, 1);

    const where: Prisma.WalletWhereInput = { role: 'CLIENT' };
    if (status) {
      if (!WalletAdminController.VALID_STATUS.includes(status as WalletStatus)) {
        throw new BadRequestException('Statut invalide');
      }
      where.status = status as WalletStatus;
    }
    const search = phone?.trim();
    if (search) where.phone = { contains: search };

    return this.prisma.wallet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * take,
      take,
      select: WalletAdminController.LIST_SELECT,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        fullName: true,
        status: true,
        balanceCents: true,
        currency: true,
        kycLevel: true,
        role: true,
        merchantId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!wallet) throw new NotFoundException('Wallet introuvable');

    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, amountCents: true, status: true, description: true, createdAt: true },
    });
    return { ...wallet, transactions };
  }

  @Post(':id/activate')
  activate(@Param('id') id: string, @Body() dto: ActivateWalletDto) {
    return this.apply(
      id,
      'ACTIVE',
      (current) => {
        if (current === 'ACTIVE') return 'Wallet déjà actif';
        if (current === 'SUSPENDED') return 'Wallet bloqué — utiliser Débloquer';
        if (current === 'CLOSED') return 'Wallet clôturé';
        return null; // PENDING_VERIFICATION → ACTIVE
      },
      dto.officer,
      dto.reason,
      'ACTIVATE',
    );
  }

  @Post(':id/block')
  block(@Param('id') id: string, @Body() dto: WalletActionDto) {
    return this.apply(
      id,
      'SUSPENDED',
      (current) => {
        if (current === 'SUSPENDED') return 'Wallet déjà bloqué';
        if (current === 'CLOSED') return 'Wallet clôturé';
        return null;
      },
      dto.officer,
      dto.reason,
      'BLOCK',
    );
  }

  @Post(':id/unblock')
  unblock(@Param('id') id: string, @Body() dto: WalletActionDto) {
    return this.apply(
      id,
      'ACTIVE',
      (current) => (current === 'SUSPENDED' ? null : 'Wallet non bloqué'),
      dto.officer,
      dto.reason,
      'UNBLOCK',
    );
  }

  // Rattache un wallet à un marchand comme caissier (MERCHANT_CASHIER) —
  // remplace le rattachement manuel en DB (AVANT_PROD §0.7).
  @Post(':id/attach-cashier')
  async attachCashier(@Param('id') id: string, @Body() dto: AttachCashierDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });
    if (!wallet) throw new NotFoundException('Wallet introuvable');
    if (wallet.status === 'CLOSED') throw new BadRequestException('Wallet clôturé');

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Marchand introuvable');

    const updated = await this.prisma.wallet.update({
      where: { id },
      data: { merchantId: merchant.id, role: 'MERCHANT_CASHIER' },
      select: { ...WalletAdminController.LIST_SELECT, role: true, merchantId: true },
    });
    this.logger.log(
      `Wallet ${id} (${wallet.phone}) rattaché au marchand ${merchant.id} comme MERCHANT_CASHIER par ${dto.officer}` +
        (dto.reason ? ` · motif: ${dto.reason}` : ''),
    );
    return updated;
  }

  // Détache un caissier de son marchand : redevient un wallet client standard.
  @Post(':id/detach-cashier')
  async detachCashier(@Param('id') id: string, @Body() dto: WalletActionDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      select: { id: true, phone: true, role: true, merchantId: true },
    });
    if (!wallet) throw new NotFoundException('Wallet introuvable');
    if (wallet.role !== 'MERCHANT_CASHIER' && !wallet.merchantId) {
      throw new BadRequestException('Wallet non rattaché à un marchand');
    }

    const updated = await this.prisma.wallet.update({
      where: { id },
      data: { merchantId: null, role: 'CLIENT' },
      select: { ...WalletAdminController.LIST_SELECT, role: true, merchantId: true },
    });
    this.logger.log(
      `Wallet ${id} (${wallet.phone}) détaché du marchand ${wallet.merchantId ?? '?'} par ${dto.officer} · motif: ${dto.reason}`,
    );
    return updated;
  }

  // Transition de statut atomique avec garde métier + journal d'audit.
  private async apply(
    id: string,
    to: WalletStatus,
    guard: (current: WalletStatus) => string | null,
    officer: string,
    reason: string | undefined,
    action: string,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });
    if (!wallet) throw new NotFoundException('Wallet introuvable');

    const error = guard(wallet.status);
    if (error) throw new BadRequestException(error);

    const updated = await this.prisma.wallet.update({
      where: { id },
      data: { status: to },
      select: WalletAdminController.LIST_SELECT,
    });
    this.logger.log(
      `Wallet ${id} (${wallet.phone}) ${wallet.status} → ${to} · ${action} par ${officer}` +
        (reason ? ` · motif: ${reason}` : ''),
    );
    return updated;
  }
}
