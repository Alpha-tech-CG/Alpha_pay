import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PaymentMethodType } from '@paybrain/database';

export class CreateRoutingRuleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  partnerId!: string;

  @IsOptional() @IsInt() @Min(0) priority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsEnum(PaymentMethodType) method?: PaymentMethodType;
  @IsOptional() @IsString() merchantSegment?: string;
  @IsOptional() @IsString() binPrefix?: string;
  @IsOptional() @IsInt() @Min(0) minAmountCents?: number | null;
  @IsOptional() @IsInt() @Min(0) maxAmountCents?: number | null;
}

export class UpdateRoutingRuleDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @IsInt() @Min(0) priority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsEnum(PaymentMethodType) method?: PaymentMethodType;
  @IsOptional() @IsString() merchantSegment?: string;
  @IsOptional() @IsString() binPrefix?: string;
  @IsOptional() @IsInt() @Min(0) minAmountCents?: number | null;
  @IsOptional() @IsInt() @Min(0) maxAmountCents?: number | null;
}

// Entrée du simulateur de routage (outil de test back-office).
export class SimulateRoutingDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsEnum(PaymentMethodType) method?: PaymentMethodType;
  @IsOptional() @IsString() merchantSegment?: string;
  @IsOptional() @IsString() bin?: string;
  @IsOptional() @IsInt() @Min(0) amountCents?: number;
}
