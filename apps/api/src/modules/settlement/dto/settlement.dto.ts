import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";

export class RunSettlementDto {
  @IsString()
  @MinLength(1)
  merchantId!: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;
}

export class ValidateSettlementDto {
  @IsString()
  @MinLength(1)
  validatorId!: string;
}

export class SettlementConfigDto {
  @IsOptional()
  @IsIn(["DAILY", "T1", "T2", "WEEKLY"])
  frequency?: "DAILY" | "T1" | "T2" | "WEEKLY";

  @IsOptional()
  @IsInt()
  @Min(0)
  minAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  commissionBps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dayOfWeek?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(["BANK", "MOMO"])
  payoutMethod?: "BANK" | "MOMO";

  @IsOptional()
  @IsString()
  @MinLength(1)
  payoutProvider?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  payoutDestination?: string;
}
