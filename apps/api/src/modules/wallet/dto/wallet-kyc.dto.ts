import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const DOC_TYPES = ['ID_FRONT', 'ID_BACK', 'SELFIE'] as const;
const MIME_TYPES = ['image/jpeg', 'image/png'] as const;

// Étape 1 : demande d'URL S3 présignée pour uploader la pièce directement
// (jamais via notre API — évite de faire transiter l'image par le backend).
export class CreateKycUploadUrlDto {
  @IsIn(DOC_TYPES)
  type!: (typeof DOC_TYPES)[number];

  @IsIn(MIME_TYPES)
  mimeType!: (typeof MIME_TYPES)[number];
}

// Étape 2 : confirmation après upload direct sur S3 (KYC N0 → N1).
export class ConfirmKycDocDto {
  @IsIn(DOC_TYPES)
  type!: (typeof DOC_TYPES)[number];

  @IsIn(MIME_TYPES)
  mimeType!: (typeof MIME_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storageKey!: string;
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
