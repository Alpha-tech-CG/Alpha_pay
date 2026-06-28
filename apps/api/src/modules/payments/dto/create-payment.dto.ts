import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, IsOptional } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@paybrain/shared';
import { IsE164Phone } from '../../../common/validation/is-e164-phone.validator';

// Plafond aligné sur l'audit : 5 000 000 (XAF, devise de production). Empêche
// la création de transactions à montant absurde (overflow, blanchiment).
const AMOUNT_MAX = 5_000_000;

export class CreatePaymentDto {
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  @Min(1)
  @Max(AMOUNT_MAX, { message: `amount ne peut dépasser ${AMOUNT_MAX}` })
  amount!: number;

  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsE164Phone()
  phone!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, {
    message: 'externalId doit correspondre à [A-Za-z0-9_-]{1,64}',
  })
  externalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'description limitée à 200 caractères' })
  description?: string;
}
