import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReconciliationDayStatus } from '@paybrain/database';

export class PatchReconciliationDayDto {
  @IsOptional()
  @IsEnum(ReconciliationDayStatus)
  status?: ReconciliationDayStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
