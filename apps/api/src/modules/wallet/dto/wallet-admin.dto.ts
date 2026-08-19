import { IsOptional, IsString, MinLength } from 'class-validator';

// Actions ops sur wallet client depuis le back-office (InternalGuard).
// `officer` = e-mail de l'agent (traçabilité), journalisé à chaque décision.

export class ActivateWalletDto {
  @IsString()
  @MinLength(1)
  officer!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

// Blocage / déblocage : motif obligatoire (action sensible, compliance).
export class WalletActionDto {
  @IsString()
  @MinLength(1)
  officer!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

// Rattachement d'un wallet à un marchand comme caissier (MERCHANT_CASHIER) —
// remplace le rattachement manuel en base (AVANT_PROD §0.7).
export class AttachCashierDto {
  @IsString()
  @MinLength(1)
  merchantId!: string;

  @IsString()
  @MinLength(1)
  officer!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
