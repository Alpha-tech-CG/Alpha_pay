import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCashEntryDto {
  /** Montant en unités mineures (XAF = francs entiers). */
  @IsInt()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  /** Date de la déclaration (ISO 8601, partie date uniquement). Défaut : aujourd'hui. */
  @IsOptional()
  @IsDateString()
  entry_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  till_id?: string;
}
