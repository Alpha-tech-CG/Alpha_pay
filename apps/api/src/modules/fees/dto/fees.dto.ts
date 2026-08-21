import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min, MinLength } from 'class-validator';
import { PaymentMethodType } from '@paybrain/database';

export class CreateFeeProfileDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class CreateFeeRuleDto {
  @IsOptional() @IsEnum(PaymentMethodType) method?: PaymentMethodType;
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @IsInt() @Min(0) minAmountCents?: number | null;
  @IsOptional() @IsInt() @Min(0) maxAmountCents?: number | null;
  @IsOptional() @IsInt() @Min(0) percentBps?: number;
  @IsOptional() @IsInt() @Min(0) fixedCents?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class AssignFeeProfileDto {
  @IsString()
  merchantId!: string;

  // null pour retirer le profil (retour au profil par défaut).
  @IsOptional() @IsString() feeProfileId?: string | null;
}

export class SimulateFeeDto {
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional() @IsString() feeProfileId?: string;
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsEnum(PaymentMethodType) method?: PaymentMethodType;
  @IsOptional() @IsString() partnerId?: string;
}
