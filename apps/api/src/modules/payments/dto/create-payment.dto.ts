import { IsNumber, IsString, Min, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  currency!: string;

  @IsString()
  phone!: string;

  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
