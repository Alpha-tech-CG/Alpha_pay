import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { Operator } from '../../../common/types/operator.enum';

export class InitiatePaymentDto {
  @IsNumber() @IsPositive() amount: number;
  @IsString() @Length(3, 4) currency: string;
  @IsEnum(Operator) operator: Operator;
  @IsString() phoneNumber: string;
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreateTransferDto {
  @IsNumber() @IsPositive() amount: number;
  @IsString() @Length(3, 4) sourceCurrency: string;
  @IsString() @Length(3, 4) targetCurrency: string;
  @IsString() recipientPhone: string;
  @IsString() corridor: string; // e.g. CONGO_LIBYA, CONGO_FRANCE
}

export class TransactionFilterDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsNumber() limit?: number;
  @IsOptional() @IsNumber() offset?: number;
}
