import { IsEnum, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { Market } from '../../../common/types/market.enum';

export class RegisterDto {
  @IsString()
  @Length(8, 20)
  phoneNumber: string;

  @IsEnum(Market)
  market: Market;
}

export class VerifyOtpDto {
  @IsString()
  @Length(8, 20)
  phoneNumber: string;

  @IsString()
  @Length(4, 6)
  otp: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class LoginDto {
  @IsString()
  @Length(8, 20)
  phoneNumber: string;

  @IsOptional()
  @IsString()
  otp?: string;
}
