import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload envoyé par la passerelle USSD (format Africa's Talking,
 * application/x-www-form-urlencoded).
 */
export class UssdSessionDto {
  @IsString()
  @MaxLength(128)
  sessionId!: string;

  @IsString()
  @MaxLength(32)
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  serviceCode?: string;

  // Texte cumulé de la session ("" au démarrage). Borné pour éviter tout abus.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string;
}
