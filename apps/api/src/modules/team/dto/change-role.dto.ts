import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { MemberRole } from '../permissions/permissions';

export class ChangeRoleDto {
  // Propriétaire exclu : réservé au transfert de propriété.
  @ApiProperty({ enum: ['ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER'] })
  @IsIn(['ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER'])
  role!: Exclude<MemberRole, 'OWNER'>;
}
