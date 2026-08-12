import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const DOC_TYPES = ['ID_FRONT', 'ID_BACK', 'SELFIE'] as const;
const MIME_TYPES = ['image/jpeg', 'image/png'] as const;

// Upload d'une pièce d'identité par le client (KYC N0 → N1).
export class UploadKycDocDto {
  @IsIn(DOC_TYPES)
  type!: (typeof DOC_TYPES)[number];

  @IsIn(MIME_TYPES)
  mimeType!: (typeof MIME_TYPES)[number];

  // Image encodée base64 (sans préfixe data:). Bornée à ~6 Mo (démo).
  @IsString()
  @MinLength(1)
  @MaxLength(6_000_000)
  dataBase64!: string;
}

// Revue d'une pièce depuis le back-office (approbation : motif facultatif).
export class ReviewKycDocDto {
  @IsString()
  @MinLength(1)
  officer!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

// Rejet : motif obligatoire (action sensible, tracée).
export class RejectKycDocDto {
  @IsString()
  @MinLength(1)
  officer!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
