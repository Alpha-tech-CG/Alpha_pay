import { IsEmail, IsIn } from 'class-validator';
import { MemberRole } from '../permissions/permissions';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  // OWNER exclu : réservé au transfert de propriété (ownership.service.transfer).
  @IsIn(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
  role!: Exclude<MemberRole, 'OWNER'>;
}
