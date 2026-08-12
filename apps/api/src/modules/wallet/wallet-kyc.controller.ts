import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { WalletJwtGuard, WalletJwtPayload } from './wallet-jwt.guard';
import { UploadKycDocDto } from './dto/wallet-kyc.dto';

interface AuthRequest {
  wallet: WalletJwtPayload;
}

// Endpoints client (JWT wallet) : soumission des pièces d'identité pour passer
// au niveau KYC N1. Le corps (image base64) est admis jusqu'à 6 Mo pour ce seul
// chemin — cf. main.ts (parser JSON dédié) et body-guard (largeJsonPaths).
@Controller('v1/wallet/kyc')
@UseGuards(WalletJwtGuard)
export class WalletKycController {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  @Post('documents')
  async upload(@Request() req: AuthRequest, @Body() dto: UploadKycDocDto) {
    await this.prisma.walletKycDocument.create({
      data: {
        walletId: req.wallet.sub,
        type: dto.type,
        mimeType: dto.mimeType,
        dataBase64: dto.dataBase64,
      },
    });
    return { ok: true };
  }

  // État KYC du client : niveau courant + statut de ses pièces (sans l'image).
  @Get('status')
  async status(@Request() req: AuthRequest) {
    const [wallet, documents] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { id: req.wallet.sub },
        select: { kycLevel: true },
      }),
      this.prisma.walletKycDocument.findMany({
        where: { walletId: req.wallet.sub },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, status: true, reviewReason: true, createdAt: true },
      }),
    ]);
    return { kycLevel: wallet?.kycLevel ?? 'N0', documents };
  }
}
