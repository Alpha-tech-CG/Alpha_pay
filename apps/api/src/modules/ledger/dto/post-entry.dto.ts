import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class JournalLineDto {
  @IsString()
  accountId!: string;

  @IsIn(['DEBIT', 'CREDIT'])
  direction!: 'DEBIT' | 'CREDIT';

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class PostEntryDto {
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  @ArrayMinSize(1)
  lines!: JournalLineDto[];
}
