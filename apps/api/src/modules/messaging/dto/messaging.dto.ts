import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PUBLIC_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type PublicChannel = (typeof PUBLIC_CHANNELS)[number];

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toLowerCase() : value);

export class SendMessageDto {
  @ApiProperty({ enum: PUBLIC_CHANNELS, example: 'sms' })
  @Transform(lower)
  @IsIn(PUBLIC_CHANNELS)
  channel!: PublicChannel;

  @ApiProperty({ description: 'Numéro (E.164 ou local du Congo) pour SMS et WhatsApp, adresse pour l’email.', example: '+242061234567' })
  @IsString()
  @MaxLength(254)
  to!: string;

  @ApiProperty({ description: 'Texte du message.', example: 'Votre commande est prête.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;

  @ApiPropertyOptional({ description: 'Objet (email seulement).' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  subject?: string;

  @ApiPropertyOptional({ enum: PUBLIC_CHANNELS, isArray: true, description: 'Canaux de bascule, dans l’ordre (ex. ["sms"] après WhatsApp).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.toLowerCase() : v)) : value))
  @IsIn(PUBLIC_CHANNELS, { each: true })
  fallback?: PublicChannel[];

  @ApiPropertyOptional({ enum: ['transactional', 'marketing'], default: 'transactional', description: 'Les messages marketing respectent les désabonnements (STOP).' })
  @IsOptional()
  @Transform(lower)
  @IsIn(['transactional', 'marketing'])
  category?: 'transactional' | 'marketing';
}

export class SendOtpDto {
  @ApiProperty({ enum: PUBLIC_CHANNELS, example: 'whatsapp' })
  @Transform(lower)
  @IsIn(PUBLIC_CHANNELS)
  channel!: PublicChannel;

  @ApiProperty({ example: '+242061234567' })
  @IsString()
  @MaxLength(254)
  to!: string;

  @ApiPropertyOptional({ description: 'Usage du code ; un code émis pour un usage ne valide pas un autre usage.', default: 'verification', example: 'paiement' })
  @IsOptional()
  @Matches(/^[a-z0-9_.-]{1,40}$/, { message: 'purpose : 1 à 40 caractères parmi a-z, 0-9, « _ », « . », « - »' })
  purpose?: string;

  @ApiPropertyOptional({ enum: PUBLIC_CHANNELS, isArray: true, description: 'Canaux de bascule (ex. ["sms"] si WhatsApp échoue).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.toLowerCase() : v)) : value))
  @IsIn(PUBLIC_CHANNELS, { each: true })
  fallback?: PublicChannel[];
}

export class VerifyOtpDto {
  @ApiProperty({ enum: PUBLIC_CHANNELS, example: 'whatsapp', description: 'Canal demandé à l’envoi (le destinataire est lié au canal).' })
  @Transform(lower)
  @IsIn(PUBLIC_CHANNELS)
  channel!: PublicChannel;

  @ApiProperty({ example: '+242061234567' })
  @IsString()
  @MaxLength(254)
  to!: string;

  @ApiPropertyOptional({ default: 'verification' })
  @IsOptional()
  @Matches(/^[a-z0-9_.-]{1,40}$/)
  purpose?: string;

  @ApiProperty({ example: '482913' })
  @Matches(/^\d{6}$/, { message: 'code : 6 chiffres' })
  code!: string;
}
