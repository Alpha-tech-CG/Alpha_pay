import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { WalletKycLevel } from '@paybrain/database';
import { InternalGuard } from '../../common/guards/internal.guard';
import { WalletLimitsService } from './wallet-limits.service';

class UpsertLimitDto {
  @IsInt() @Min(0)
  maxBalanceCents!: number;

  @IsInt() @Min(0)
  perTxCents!: number;

  @IsInt() @Min(0)
  dailyCents!: number;

  @IsInt() @Min(0)
  monthlyCents!: number;
}

/**
 * Administration des plafonds e-money (ALP-174). Réseau interne uniquement.
 * Permet d'ajuster les seuils par niveau KYC sans redéploiement.
 */
@Controller('internal/wallet-limits')
@UseGuards(InternalGuard)
export class WalletLimitsController {
  constructor(private readonly service: WalletLimitsService) {}

  @Get()
  list() {
    return this.service.listLimits();
  }

  @Put(':level')
  upsert(@Param('level') level: WalletKycLevel, @Body() dto: UpsertLimitDto) {
    return this.service.upsertLimit(level, {
      maxBalanceCents: BigInt(dto.maxBalanceCents),
      perTxCents: BigInt(dto.perTxCents),
      dailyCents: BigInt(dto.dailyCents),
      monthlyCents: BigInt(dto.monthlyCents),
    });
  }
}
