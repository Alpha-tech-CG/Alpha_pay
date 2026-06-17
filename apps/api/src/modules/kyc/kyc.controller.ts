import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { KycService } from './kyc.service';
import { AddKycDocumentDto } from './dto/kyc.dto';

// Endpoints marchand : soumission de son propre dossier KYC.
@Controller('v1/kyc')
@UseGuards(ApiKeyGuard)
export class KycController {
  constructor(
    private readonly kyc: KycService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  @Get()
  async myCase(@Req() req: any) {
    const c = await this.prisma.kycCase.findUnique({ where: { merchantId: req.merchant.id }, include: { documents: { select: { type: true } } } });
    return c ?? { status: 'NOT_STARTED', documents: [] };
  }

  @Post('documents')
  addDocument(@Body() dto: AddKycDocumentDto, @Req() req: any) {
    return this.kyc.addDocument(req.merchant.id, dto.type, dto.s3Key);
  }

  @Post('submit')
  submit(@Req() req: any) {
    return this.kyc.submit(req.merchant.id);
  }
}
