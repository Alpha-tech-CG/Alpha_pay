import { IsIn, IsInt, IsString, Max, MaxLength, Min, IsOptional, IsPositive } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@paybrain/shared';

const AMOUNT_MAX = 5_000_000;

export class CreatePaylinkDto {
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  @Min(1)
  @Max(AMOUNT_MAX, { message: `amount ne peut dépasser ${AMOUNT_MAX}` })
  amount!: number;

  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsString()
  @MaxLength(200, { message: 'description limitée à 200 caractères' })
  description!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(60 * 24 * 30, { message: 'expiresInMinutes ne peut dépasser 30 jours' })
  expiresInMinutes?: number;
}
