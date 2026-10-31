import { IsBoolean, IsIn, IsInt, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min, MinLength, IsOptional, ValidateIf } from 'class-validator';
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

  /** Moyen de paiement : Mobile Money (défaut) ou carte (page hébergée par l'acquéreur). */
  @ApiPropertyOptional({ enum: ['mobile_money', 'card'], default: 'mobile_money' })
  @IsOptional()
  @IsIn(['mobile_money', 'card'], { message: 'method : mobile_money ou card' })
  method: 'mobile_money' | 'card' = 'mobile_money';

  @ApiPropertyOptional({ example: '+242061234567', description: 'Obligatoire pour le Mobile Money' })
  @ValidateIf((o) => o.method !== 'card')
  @IsE164Phone()
  phone!: string;

  /** Carte : page du marchand où revient le payeur après paiement. */
  @ApiPropertyOptional({ example: 'https://boutique.cg/commande/1042/merci' })
  @ValidateIf((o) => o.method === 'card')
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] }, { message: 'return_url : URL complète (https://…)' })
  @MaxLength(500)
  return_url?: string;

  /** Carte : page où revient le payeur s'il abandonne (défaut : return_url). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] }, { message: 'cancel_url : URL complète (https://…)' })
  @MaxLength(500)
  cancel_url?: string;

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

/** Corps de POST /v1/payments/:id/refunds. */
export class CreateRefundDto {
  /** Unités majeures ; absent = tout le montant restant. */
  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  @Min(1)
  @Max(AMOUNT_MAX)
  amount?: number;

  @ApiProperty({ example: 'Article retourné' })
  @IsString()
  @MinLength(3, { message: 'reason : motif obligatoire' })
  @MaxLength(200)
  reason!: string;

  /** Mobile Money : remboursement déjà fait depuis le compte opérateur, à déclarer. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  manual?: boolean;
}

/** Corps de POST /v1/disputes/:id/evidence. */
export class DisputeEvidenceDto {
  @ApiProperty({ example: 'Commande livrée le 12/11, bon de livraison signé par le client.' })
  @IsString()
  @MinLength(10, { message: 'evidence : décrivez vos preuves (10 caractères au moins)' })
  @MaxLength(5000)
  evidence!: string;
}
