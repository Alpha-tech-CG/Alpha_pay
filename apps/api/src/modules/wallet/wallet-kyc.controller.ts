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
import { CreateKycUploadUrlDto, ConfirmKycDocDto } from './dto/wallet-kyc.dto';
import { KycDocumentStorageService } from '../kyc/kyc-document-storage.service';

interface AuthRequest {
  wallet: WalletJwtPayload;
}

// Endpoints client (JWT wallet) : soumission des pièces d'identité pour passer
// au niveau KYC N1. L'image transite en upload direct vers S3 (jamais par notre
// API) : le client demande une URL présignée, uploade dessus, puis confirme.
@Controller('v1/wallet/kyc')
@UseGuards(WalletJwtGuard)
export class WalletKycController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly storage: KycDocumentStorageService,
  ) {}

  @Post('documents/upload-url')
  createUploadUrl(@Request() req: AuthRequest, @Body() dto: CreateKycUploadUrlDto) {
    return this.storage.createWalletUploadUrl(req.wallet.sub, dto.type, dto.mimeType);
  }

  @Post('documents')
  async upload(@Request() req: AuthRequest, @Body() dto: ConfirmKycDocDto) {
    // Vérifie que l'objet a bien été uploadé (chiffré, taille raisonnable,
    // clé cohérente avec ce wallet/type) avant d'enregistrer la référence.
    await this.storage.verifyWalletUploadedDocument(dto.storageKey, req.wallet.sub, dto.type);
    await this.prisma.walletKycDocument.create({
      data: {
        walletId: req.wallet.sub,
        type: dto.type,
        mimeType: dto.mimeType,
        storageKey: dto.storageKey,
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
