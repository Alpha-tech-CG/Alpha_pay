import { IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
