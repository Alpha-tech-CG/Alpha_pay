import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsE164Phone } from '../../common/validation/is-e164-phone.validator';

export const CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type PublicChannel = (typeof CHANNELS)[number];

export class CreateCustomerDto {
  @ApiProperty({ example: 'Jean Mabiala' })
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: '+242061234567' })
  @IsOptional() @IsE164Phone()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(250)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Canaux des relances et reçus, dans l’ordre d’essai', example: ['whatsapp', 'sms'] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ArrayUnique() @IsIn(CHANNELS, { each: true })
  channels?: PublicChannel[];
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsE164Phone() phone?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ArrayUnique() @IsIn(CHANNELS, { each: true }) channels?: PublicChannel[];
}

export class InvoiceLineDto {
  @ApiProperty({ example: 'Sac de ciment 50 kg' })
  @IsString() @MinLength(1) @MaxLength(250)
  description!: string;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() @Max(1_000_000)
  quantity!: number;

  @ApiProperty({ description: 'Prix unitaire en unités majeures (XAF : francs entiers)', example: 7500 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000)
  unit_price!: number;

  @ApiPropertyOptional({ description: 'Taux de taxe en %', example: 18 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  tax_rate?: number;
}

export class InstallmentDto {
  @ApiProperty({ example: '2026-12-15' })
  @IsDateString()
  due_date!: string;

  @ApiProperty({ description: 'Montant en unités majeures', example: 50000 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: '1er trimestre' })
  @IsOptional() @IsString() @MaxLength(120)
  label?: string;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional({ default: 'XAF' })
  @IsOptional() @IsIn(['XAF', 'EUR'])
  currency?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional() @IsDateString()
  due_date?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];

  @ApiPropertyOptional({ type: [InstallmentDto], description: 'Échéancier : la somme doit égaler le total' })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => InstallmentDto)
  installments?: InstallmentDto[];

  @ApiPropertyOptional({ description: 'Envoyer la facture tout de suite (numéro, lien de paiement, relances)' })
  @IsOptional() @IsBoolean()
  send?: boolean;
}

export class SetInstallmentsDto {
  @ApiProperty({ type: [InstallmentDto] })
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => InstallmentDto)
  installments!: InstallmentDto[];
}

export class RecoverySettingsDto {
  @ApiPropertyOptional({ description: 'Jours par rapport à l’échéance (négatif = avant)', example: [-3, 0, 3, 7] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsInt({ each: true }) @Min(-60, { each: true }) @Max(90, { each: true })
  reminder_offsets?: number[];

  @IsOptional() @IsBoolean()
  reminders_enabled?: boolean;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional() @IsInt() @Min(0) @Max(23)
  send_from_hour?: number;

  @ApiPropertyOptional({ example: 19 })
  @IsOptional() @IsInt() @Min(1) @Max(24)
  send_until_hour?: number;
}

export class ListInvoicesQuery {
  @IsOptional() @IsIn(['brouillon', 'envoyée', 'partiellement_payée', 'payée', 'en_retard', 'annulée'])
  status?: string;

  @IsOptional() @IsUUID()
  customer_id?: string;

  @IsOptional() @IsString() @MaxLength(60)
  q?: string;

  @IsOptional() @IsIn(['test', 'live'])
  mode?: string;

  @IsOptional() @IsString()
  limit?: string;

  @IsOptional() @IsString() @MaxLength(200)
  starting_after?: string;
}
