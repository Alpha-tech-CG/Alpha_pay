import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type OtpChannelInput = (typeof CHANNELS)[number];
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toLowerCase().trim() : value);

export class RegisterDto {
  @ApiProperty({ example: 'Boutique Mabiala', description: 'Nom du commerce (et du titulaire du compte).' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '061234567' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ example: 'gerant@boutique.cg' })
  @IsEmail({}, { message: 'email invalide' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: CHANNELS, default: 'sms', description: 'Canal du code de vérification.' })
  @IsOptional()
  @Transform(lower)
  @IsIn(CHANNELS)
  channel?: OtpChannelInput;
}

export class LoginDto {
  @ApiProperty({ example: 'gerant@boutique.cg', description: 'Email ou numéro de téléphone.' })
  @IsString()
  @MaxLength(254)
  identifier!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: CHANNELS, description: 'Canal du code ; par défaut celui préféré du compte.' })
  @IsOptional()
  @Transform(lower)
  @IsIn(CHANNELS)
  channel?: OtpChannelInput;
}

export class VerifyCodeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  challenge!: string;

  @ApiProperty({ example: '482913' })
  @Matches(/^\d{6}$/, { message: 'code : 6 chiffres' })
  code!: string;
}

/** Ouverture de session : l'app mobile reçoit son jeton de rafraîchissement dans la réponse. */
export class VerifySessionDto extends VerifyCodeDto {
  @ApiPropertyOptional({ enum: ['web', 'mobile'], default: 'web', description: 'mobile : jeton de rafraîchissement dans la réponse (stockage sécurisé de l’appareil) au lieu du cookie.' })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  client?: 'web' | 'mobile';
}

/** Rafraîchissement de l'app mobile : le jeton vient du corps, pas d'un cookie. */
export class RefreshDto {
  @ApiPropertyOptional({ description: 'App mobile uniquement ; le navigateur utilise le cookie.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  refresh_token?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email ou numéro de téléphone.' })
  @IsString()
  @MaxLength(254)
  identifier!: string;

  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @Transform(lower)
  @IsIn(CHANNELS)
  channel?: OtpChannelInput;
}

export class ResetPasswordDto extends VerifyCodeDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MaxLength(128)
  password!: string;
}
