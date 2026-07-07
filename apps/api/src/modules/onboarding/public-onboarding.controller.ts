import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OnboardingService, UploadedIdDocument } from './onboarding.service';

class StandardSignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9\s\-]{8,20}$/, { message: 'Numéro de téléphone invalide' })
  phone!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;
}

class DeveloperSignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9\s\-]{8,20}$/, { message: 'Numéro de téléphone invalide' })
  phone!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  company!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;

  @IsString()
  @IsIn(['ecommerce', 'marketplace', 'saas', 'delivery', 'education', 'other'])
  useCase!: string;
}

@Controller('v1/onboarding')
export class PublicOnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Post('standard')
  @HttpCode(200)
  register(@Body() dto: StandardSignupDto) {
    return this.service.registerStandard(dto);
  }

  /** Inscription développeur : multipart avec pièce d'identité (≤ 5 Mo, JPG/PNG/PDF). */
  @Post('developer')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('idDocument', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  registerDeveloper(
    @Body() dto: DeveloperSignupDto,
    @UploadedFile() idDocument?: UploadedIdDocument,
  ) {
    if (!idDocument) throw new BadRequestException('Pièce d\'identité requise');
    return this.service.registerDeveloper(dto, idDocument);
  }
}
