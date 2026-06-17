import { IsE164Phone } from '../../../common/validation/is-e164-phone.validator';

export class PayPaylinkDto {
  @IsE164Phone()
  phone!: string;
}
