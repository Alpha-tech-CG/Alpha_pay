import { IsString, IsIn, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(512)
  token!: string;

  @IsIn(['expo', 'apns', 'fcm'])
  platform!: string;
}
