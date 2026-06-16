import { IsString } from 'class-validator';

export class PayPaylinkDto {
  @IsString()
  phone!: string;
}
