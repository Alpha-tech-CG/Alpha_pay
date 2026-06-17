import { IsIn, IsISO8601, IsString, MinLength } from 'class-validator';

export class RunReconciliationDto {
  @IsIn(['MTN', 'AIRTEL'])
  operator!: 'MTN' | 'AIRTEL';

  @IsISO8601()
  statementDate!: string;

  /** Contenu brut du relevé CSV (référence, montant, date…). */
  @IsString()
  @MinLength(1)
  csv!: string;
}
