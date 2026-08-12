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
import { PrismaClient, WalletKycDocStatus } from '@paybrain/database';
import { InternalGuard } from '../../common/guards/internal.guard';
import { RejectKycDocDto, ReviewKycDocDto } from './dto/wallet-kyc.dto';

// Back-office ops : revue des pièces d'identité clients reçues (queue KYC wallet).
// Approuver une pièce fait passer le wallet au niveau N1 (plafonds e-money élevés).
@Controller('internal/wallets/kyc')
@UseGuards(InternalGuard)
export class WalletKycAdminController {
  private readonly logger = new Logger(WalletKycAdminController.name);

  private static readonly VALID_STATUS: WalletKycDocStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  private static readonly WALLET_SELECT = {
    select: { id: true, phone: true, fullName: true, kycLevel: true, status: true },
  };

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  // Liste des pièces (sans l'image, trop lourde). Filtre statut, défaut PENDING.
  @Get('documents')
  list(@Query('status') status?: string) {
    let where;
    if (status) {
      if (!WalletKycAdminController.VALID_STATUS.includes(status as WalletKycDocStatus)) {
        throw new BadRequestException('Statut invalide');
      }
      where = { status: status as WalletKycDocStatus };
    } else {
      where = { status: 'PENDING' as WalletKycDocStatus };
    }
    return this.prisma.walletKycDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        reviewedBy: true,
        reviewReason: true,
        createdAt: true,
        wallet: WalletKycAdminController.WALLET_SELECT,
      },
    });
  }

  // Détail d'une pièce, image incluse (data URI côté admin : data:mime;base64,...).
  @Get('documents/:id')
  async get(@Param('id') id: string) {
    const doc = await this.prisma.walletKycDocument.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        mimeType: true,
        dataBase64: true,
        status: true,
        reviewedBy: true,
        reviewReason: true,
        reviewedAt: true,
        createdAt: true,
        wallet: WalletKycAdminController.WALLET_SELECT,
      },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc;
  }

  @Post('documents/:id/approve')
  async approve(@Param('id') id: string, @Body() dto: ReviewKycDocDto) {
    const doc = await this.requireDoc(id);
    if (doc.status === 'APPROVED') throw new BadRequestException('Document déjà approuvé');

    await this.prisma.$transaction([
      this.prisma.walletKycDocument.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: dto.officer,
          reviewReason: dto.reason ?? null,
          reviewedAt: new Date(),
        },
      }),
      // Pièce validée → le client accède aux plafonds N1 (ALP-174).
      this.prisma.wallet.update({ where: { id: doc.walletId }, data: { kycLevel: 'N1' } }),
    ]);
    this.logger.log(`KYC wallet ${doc.walletId} pièce ${id} APPROUVÉE par ${dto.officer} → N1`);
    return { ok: true };
  }

  @Post('documents/:id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectKycDocDto) {
    const doc = await this.requireDoc(id);
    if (doc.status === 'REJECTED') throw new BadRequestException('Document déjà rejeté');

    await this.prisma.walletKycDocument.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: dto.officer,
        reviewReason: dto.reason,
        reviewedAt: new Date(),
      },
    });
    this.logger.log(`KYC wallet ${doc.walletId} pièce ${id} REJETÉE par ${dto.officer} · motif: ${dto.reason}`);
    return { ok: true };
  }

  private async requireDoc(id: string) {
    const doc = await this.prisma.walletKycDocument.findUnique({
      where: { id },
      select: { id: true, status: true, walletId: true },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc;
  }
}
