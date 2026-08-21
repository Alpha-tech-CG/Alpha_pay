import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, MinLength, Min } from 'class-validator';
import { PartnerStatus, PartnerType } from '@paybrain/database';

export class CreatePartnerDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(PartnerType)
  type!: PartnerType;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @IsOptional()
  @IsString()
  sandboxBaseUrl?: string;

  @IsOptional()
  @IsString()
  prodBaseUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;
}

export class UpdatePartnerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEnum(PartnerType) type?: PartnerType;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
  @IsOptional() @IsString() sandboxBaseUrl?: string;
  @IsOptional() @IsString() prodBaseUrl?: string;
  @IsOptional() @IsInt() @Min(1000) timeoutMs?: number;
  @IsOptional() @IsInt() @Min(0) maxRetries?: number;
}

// La valeur du credential est chiffrée côté serveur (AES-256-GCM) et n'est
// JAMAIS renvoyée en clair par l'API.
export class UpsertCredentialDto {
  @IsIn(['sandbox', 'production'])
  environment!: string;

  @IsString()
  @MinLength(1)
  keyName!: string;

  @IsString()
  @MinLength(1)
  value!: string;
}
