import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, VerifyOtpDto, RefreshDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 req / min for /auth/*
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-otp')
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser('sub') userId: string, @Body() dto: RefreshDto) {
    return this.auth.logout(userId, dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtUser) {
    return this.users.toProfile(await this.users.findById(user.sub));
  }
}
