import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MemberRole } from '../permissions/permissions';

/** Invitation par email OU par téléphone (§M1). */
export class CreateInvitationDto {
  @ApiPropertyOptional({ example: 'caissier@boutique.cg' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '061234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  // Propriétaire exclu : réservé au transfert de propriété.
  @ApiProperty({ enum: ['ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER'] })
  @IsIn(['ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER'])
  role!: Exclude<MemberRole, 'OWNER'>;
}
