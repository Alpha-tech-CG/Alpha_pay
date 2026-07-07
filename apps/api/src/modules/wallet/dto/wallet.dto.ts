import { IsNotEmpty, IsString, Length, Matches, IsNumber, IsPositive, IsIn, IsOptional, IsInt, Max } from 'class-validator';

export class RegisterWalletDto {
  @IsString() @IsNotEmpty()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide' })
  phone!: string;

  @IsString() @IsNotEmpty()
  fullName!: string;

  /** PIN 4–6 chiffres */
  @IsString() @Length(4, 6)
  @Matches(/^[0-9]+$/, { message: 'Le PIN doit contenir uniquement des chiffres' })
  pin!: string;
}

export class LoginWalletDto {
  @IsString() @IsNotEmpty()
  phone!: string;

  @IsString() @Length(4, 6)
  @Matches(/^[0-9]+$/)
  pin!: string;
}

/** Vérification du code SMS d'inscription (ALP-171). */
export class VerifyOtpDto {
  @IsString() @IsNotEmpty()
  phone!: string;

  @IsString() @Length(6, 6)
  @Matches(/^[0-9]{6}$/, { message: 'Code à 6 chiffres attendu' })
  otp!: string;
}

export class ResendOtpDto {
  @IsString() @IsNotEmpty()
  phone!: string;
}

/** Clé d'idempotence facultative — un rejeu (double-tap, retry réseau) renvoie la transaction d'origine. */
abstract class IdempotentDto {
  @IsOptional() @IsString() @Length(8, 64)
  @Matches(/^[A-Za-z0-9\-_]+$/, { message: 'Clé d\'idempotence invalide' })
  idempotencyKey?: string;
}

export class CashInDto extends IdempotentDto {
  /** Montant en centimes XAF */
  @IsInt() @IsPositive() @Max(50_000_000_00)
  amountCents!: number;

  @IsString() @IsIn(['MTN', 'AIRTEL'])
  operator!: string;

  @IsString() @IsNotEmpty()
  phone!: string;
}

export class CashOutDto extends IdempotentDto {
  @IsInt() @IsPositive() @Max(50_000_000_00)
  amountCents!: number;

  @IsString() @IsIn(['MTN', 'AIRTEL'])
  operator!: string;

  @IsString() @IsNotEmpty()
  phone!: string;
}

export class P2PDto extends IdempotentDto {
  @IsString() @IsNotEmpty()
  toPhone!: string;

  @IsInt() @IsPositive() @Max(50_000_000_00)
  amountCents!: number;

  @IsString() @IsOptional()
  description?: string;
}

export class PayQrDto extends IdempotentDto {
  /** Payload JSON signé du QR code marchand (généré par POST /v1/wallet/qr) */
  @IsString() @IsNotEmpty()
  qrPayload!: string;
}

/** Génération d'un QR signé par un caissier (ALP-172). */
export class CreateQrDto {
  @IsInt() @IsPositive() @Max(50_000_000_00)
  amountCents!: number;

  @IsString() @IsOptional() @Length(1, 200)
  description?: string;
}

/** Paiement d'un paylink depuis le checkout web, sans session (ALP-169). */
export class CheckoutWalletPayDto extends IdempotentDto {
  @IsString() @IsNotEmpty()
  @Matches(/^\+?[0-9\s]{8,16}$/, { message: 'Numéro de téléphone invalide' })
  phone!: string;

  @IsString() @Length(4, 6)
  @Matches(/^[0-9]+$/)
  pin!: string;
}
