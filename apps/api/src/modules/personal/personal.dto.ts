import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const AMOUNT_MAX = 50_000_000;
const ACCOUNT_KINDS = ['mtn_momo', 'airtel_money', 'bank', 'card', 'cash'] as const;

export class EnvelopePlanDto {
  @IsString() @MaxLength(40) key!: string;
  @IsInt() @Min(0) @Max(AMOUNT_MAX) planned!: number;
}

/** Première configuration : revenu, budget de départ, premier objectif. */
export class SetupDto {
  @ApiPropertyOptional({ description: 'Revenu mensuel habituel en XAF ; absent si irrégulier' })
  @IsOptional() @IsInt() @Min(0) @Max(AMOUNT_MAX) monthly_income?: number;

  @IsOptional() @IsBoolean() income_irregular?: boolean;

  @ApiProperty({ type: [EnvelopePlanDto] })
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => EnvelopePlanDto)
  envelopes!: EnvelopePlanDto[];

  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) goal_name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(AMOUNT_MAX) goal_target?: number;
}

export class SettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(AMOUNT_MAX) monthly_income?: number;
  @IsOptional() @IsBoolean() income_irregular?: boolean;
  @IsOptional() @IsBoolean() round_up_enabled?: boolean;
  @IsOptional() @IsIn([100, 500, 1000, 5000]) round_up_to?: number;
  @IsOptional() @IsString() round_up_goal_id?: string;
}

export class AccountDto {
  @ApiProperty({ enum: ACCOUNT_KINDS }) @IsIn(ACCOUNT_KINDS) kind!: (typeof ACCOUNT_KINDS)[number];
  @IsString() @MinLength(1) @MaxLength(40) label!: string;
  @IsInt() @Min(0) @Max(AMOUNT_MAX) balance!: number;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) label?: string;
  @IsOptional() @IsInt() @Min(0) @Max(AMOUNT_MAX) balance?: number;
}

export class EnvelopeDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsInt() @Min(0) @Max(AMOUNT_MAX) planned!: number;
  @IsOptional() @IsInt() @Min(50) @Max(100) alert_threshold?: number;
}

export class UpdateEnvelopeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(AMOUNT_MAX) planned?: number;
  @IsOptional() @IsInt() @Min(50) @Max(100) alert_threshold?: number;
}

export class EntryDto {
  @ApiProperty({ enum: ['out', 'in'] }) @IsIn(['out', 'in']) direction!: 'out' | 'in';
  @IsInt() @Min(1) @Max(AMOUNT_MAX) amount!: number;
  @IsString() @MinLength(1) @MaxLength(80) label!: string;
  @IsOptional() @IsString() account_id?: string;
  @IsOptional() @IsString() envelope_id?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsDateString() occurred_at?: string;
}

/** Correction de catégorie : l'application retient le choix pour ce libellé. */
export class UpdateEntryDto {
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() envelope_id?: string;
}

export class GoalDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(8) emoji?: string;
  @IsInt() @Min(1) @Max(AMOUNT_MAX) target!: number;
  @IsOptional() @IsDateString() target_date?: string;
}

export class UpdateGoalDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(8) emoji?: string;
  @IsOptional() @IsInt() @Min(1) @Max(AMOUNT_MAX) target?: number;
  @IsOptional() @IsDateString() target_date?: string;
}

/** Versement (positif) ou retrait (négatif) sur un objectif. */
export class ContributionDto {
  @IsInt() @Min(-AMOUNT_MAX) @Max(AMOUNT_MAX) amount!: number;
  @IsOptional() @IsString() @MaxLength(120) note?: string;
}

export class TransferDto {
  @ApiProperty({ description: 'Identifiant AlphaPay (@nom.alphapay) ou numéro de téléphone' })
  @IsString() @MinLength(3) @MaxLength(60) to!: string;
  @IsInt() @Min(1) @Max(AMOUNT_MAX) amount!: number;
  @IsOptional() @IsString() @MaxLength(140) note?: string;
  @IsOptional() @IsString() envelope_id?: string;
  @IsOptional() @IsString() @MaxLength(20) request_code?: string;
}

export class PaymentRequestDto {
  @IsInt() @Min(1) @Max(AMOUNT_MAX) amount!: number;
  @IsString() @MinLength(1) @MaxLength(120) reason!: string;
  @IsOptional() @IsInt() @Min(1) @Max(72) ttl_hours?: number;
}
