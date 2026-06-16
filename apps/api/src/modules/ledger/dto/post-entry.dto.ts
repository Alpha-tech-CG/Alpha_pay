import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class JournalLineDto {
  @IsString()
  accountId!: string;

  @IsIn(['DEBIT', 'CREDIT'])
  direction!: 'DEBIT' | 'CREDIT';

  @IsNumber()
  @Min(0.01)
  amount!: number;

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
