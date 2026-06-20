import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const DOC_TYPES = ['ID_FRONT', 'ID_BACK', 'RCCM', 'NIU', 'STATUTES', 'PROOF_OF_ADDRESS'];

export class AddKycDocumentDto {
  @IsIn(DOC_TYPES)
  type!: 'ID_FRONT' | 'ID_BACK' | 'RCCM' | 'NIU' | 'STATUTES' | 'PROOF_OF_ADDRESS';

  /** Clé S3 du document uploadé (bucket KYC chiffré, via URL pré-signée). */
  @IsString()
  @MinLength(1)
  s3Key!: string;
}

export class CreateKycUploadDto {
  @IsIn(DOC_TYPES)
  type!: 'ID_FRONT' | 'ID_BACK' | 'RCCM' | 'NIU' | 'STATUTES' | 'PROOF_OF_ADDRESS';

  @IsIn(['application/pdf', 'image/jpeg', 'image/png'])
  contentType!: 'application/pdf' | 'image/jpeg' | 'image/png';
}

export class DecideKycDto {
  @IsIn(['APPROVED', 'REJECTED', 'NEEDS_MORE'])
  decision!: 'APPROVED' | 'REJECTED' | 'NEEDS_MORE';

  @IsString()
  @MinLength(1)
  officer!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
