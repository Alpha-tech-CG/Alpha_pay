import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsE164Phone } from '../../common/validation/is-e164-phone.validator';

export class CreateSchoolYearDto {
  @ApiProperty({ example: '2026-2027' }) @IsString() @MinLength(1) @MaxLength(40) label!: string;
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() starts_on!: string;
  @ApiProperty({ example: '2027-07-15' }) @IsDateString() ends_on!: string;
}

export class CreateClassDto {
  @ApiProperty({ example: 'CM2 A' }) @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class GuardianDto {
  @ApiProperty({ example: 'Marie Mabiala' }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsE164Phone() phone?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
  @IsOptional() @IsBoolean() is_primary?: boolean;
}

export class CreateStudentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) first_name!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) last_name!: string;
  @IsOptional() @IsUUID() school_class_id?: string;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @IsIn(['F', 'M']) gender?: string;
  @ApiPropertyOptional({ description: 'Matricule (unique dans l’école)' }) @IsOptional() @IsString() @MaxLength(40) registration_no?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => GuardianDto) guardians?: GuardianDto[];
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) first_name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) last_name?: string;
  @IsOptional() @IsUUID() school_class_id?: string;
  @IsOptional() @IsString() @MaxLength(40) registration_no?: string;
}

export class FeeGridLineDto {
  @ApiProperty({ example: 'Scolarité 1er trimestre' }) @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @ApiProperty({ description: 'Montant en unités majeures', example: 45000 }) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @ApiProperty({ example: '2026-10-15' }) @IsDateString() due_date!: string;
}

export class CreateFeeGridDto {
  @ApiProperty({ example: 'Frais CM2 2026-2027' }) @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @ApiProperty() @IsUUID() school_class_id!: string;
  @IsOptional() @IsIn(['XAF', 'EUR']) currency?: string;
  @ApiProperty({ type: [FeeGridLineDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => FeeGridLineDto)
  lines!: FeeGridLineDto[];
}
