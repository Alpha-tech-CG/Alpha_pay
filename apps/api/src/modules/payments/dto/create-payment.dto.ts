import { IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from '@paybrain/shared';
import { IsE164Phone } from '../../../common/validation/is-e164-phone.validator';

// Plafond aligné sur l'audit : 5 000 000 (XAF, devise de production). Empêche
// la création de transactions à montant absurde (overflow, blanchiment).
const AMOUNT_MAX = 5_000_000;

/** Corps de POST /v1/payments (§7). Montant en unités majeures (XAF : francs entiers). */
export class CreatePaymentDto {
  @ApiProperty({ example: 5000 })
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  @Min(1)
  @Max(AMOUNT_MAX, { message: `amount ne peut dépasser ${AMOUNT_MAX}` })
  amount!: number;

  @ApiPropertyOptional({ default: 'XAF' })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = 'XAF';

  @ApiProperty({ example: '+242061234567' })
  @IsE164Phone()
  phone!: string;

  @ApiProperty({ description: 'Référence du marchand, unique par mode (commande, facture…)', example: 'cmd-1042' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'reference doit correspondre à [A-Za-z0-9_-]{1,64}' })
  reference!: string;

  /** Opérateur forcé ; sinon déduit du préfixe du numéro (§4.2). */
  @ApiPropertyOptional({ enum: ['mtn', 'airtel'] })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['MTN', 'AIRTEL'], { message: 'operator : mtn ou airtel' })
  operator?: 'MTN' | 'AIRTEL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'description limitée à 200 caractères' })
  description?: string;

  @ApiPropertyOptional({ description: 'Caisse qui encaisse (§M6)' })
  @IsOptional()
  @IsUUID()
  till_id?: string;
}
