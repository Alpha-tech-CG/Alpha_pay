import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsPositive } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@paybrain/shared';

export class QuoteDto {
  @IsIn(SUPPORTED_CURRENCIES)
  from!: string;

  @IsIn(SUPPORTED_CURRENCIES)
  to!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class SetRateDto {
  @IsIn(SUPPORTED_CURRENCIES)
  base!: string;

  @IsIn(SUPPORTED_CURRENCIES)
  quote!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  rate!: number;
}
