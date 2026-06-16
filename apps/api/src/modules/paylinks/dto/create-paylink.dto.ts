import { IsNumber, IsString, Min, IsOptional, IsPositive } from 'class-validator';

export class CreatePaylinkDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  currency!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  expiresInMinutes?: number;
}
