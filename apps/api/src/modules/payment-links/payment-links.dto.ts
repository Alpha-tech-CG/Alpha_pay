import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@paybrain/shared';
import { IsE164Phone } from '../../common/validation/is-e164-phone.validator';

const AMOUNT_MAX = 5_000_000;

/** Corps de POST /v1/payment-links (§7, §M4). */
export class CreatePaymentLinkDto {
  @ApiPropertyOptional({ description: 'Montant fixe en unités majeures ; absent = montant libre', example: 15000 })
  @IsOptional()
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  @Min(1)
  @Max(AMOUNT_MAX, { message: `amount ne peut dépasser ${AMOUNT_MAX}` })
  amount?: number;

  @ApiPropertyOptional({ default: 'XAF' })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = 'XAF';

  @ApiProperty({ example: 'Commande n° 1042' })
  @IsString()
  @MinLength(1)
  @MaxLength(200, { message: 'description limitée à 200 caractères' })
  description!: string;

  @ApiPropertyOptional({ description: "Date d'expiration (ISO 8601)" })
  @IsOptional()
  @IsDateString({}, { message: 'expires_at : date ISO 8601' })
  expires_at?: string;

  @ApiPropertyOptional({ default: false, description: 'Payable plusieurs fois' })
  @IsOptional()
  @IsBoolean()
  multi_use?: boolean;
}

export class SendPaymentLinkDto {
  @ApiProperty({ example: '+242061234567' })
  @IsE164Phone()
  phone!: string;

  @ApiPropertyOptional({ enum: ['whatsapp', 'sms'], default: 'whatsapp' })
  @IsOptional()
  @IsIn(['whatsapp', 'sms'])
  channel: 'whatsapp' | 'sms' = 'whatsapp';
}

/** Paiement depuis la page hébergée (public). */
export class PayLinkDto {
  @ApiProperty({ example: '+242061234567' })
  @IsE164Phone()
  phone!: string;

  @ApiPropertyOptional({ description: 'Requis si le lien est à montant libre' })
  @IsOptional()
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  amount?: number;

  @ApiPropertyOptional({ enum: ['mtn', 'airtel'] })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['MTN', 'AIRTEL'], { message: 'operator : mtn ou airtel' })
  operator?: 'MTN' | 'AIRTEL';
}
