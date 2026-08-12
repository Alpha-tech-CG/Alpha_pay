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
