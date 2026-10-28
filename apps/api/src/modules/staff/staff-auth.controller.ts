import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StaffRole } from '@paybrain/database';
import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuditAction } from '../../common/audit/audit.interceptor';
import { AuditService } from '../../common/audit/audit.service';
import { StaffAuthService } from './staff-auth.service';
import { RequireStaffRole, STAFF_WRITE, StaffGuard } from './staff.guard';

class LoginDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MaxLength(200) password!: string;
}

class CodeDto {
  @IsString() @MaxLength(128) token!: string;
  @Matches(/^\d{6}$/, { message: 'code : 6 chiffres' }) code!: string;
}

class CreateStaffDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MinLength(2) @MaxLength(120) display_name!: string;
  @IsEnum(StaffRole) role!: StaffRole;
  @IsString()
  @MinLength(12, { message: 'mot de passe : 12 caractères au moins' })
  @MaxLength(200)
  password!: string;
}

/** Authentification du personnel AlphaPay (§M12) : mot de passe puis TOTP, toujours. */
@ApiExcludeController()
@Controller('internal/staff')
export class StaffAuthController {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() req: any) {
    return this.auth.loginPassword(body.email, body.password, req.ip);
  }

  @Post('login/otp')
  @HttpCode(200)
  async loginOtp(@Body() body: CodeDto, @Req() req: any) {
    const session = await this.auth.loginOtp(body.token, body.code, req.ip);
    await this.audit.record({ actorType: 'staff', actorId: session.staffId, action: 'staff.login', targetType: 'staff_user', targetId: session.staffId, ip: req.ip });
    return session.response;
  }

  @Post('login/enroll')
  @HttpCode(200)
  async enroll(@Body() body: CodeDto, @Req() req: any) {
    const session = await this.auth.enroll(body.token, body.code, req.ip);
    await this.audit.record({ actorType: 'staff', actorId: session.staffId, action: 'staff.totp_enrolled', targetType: 'staff_user', targetId: session.staffId, ip: req.ip });
    await this.audit.record({ actorType: 'staff', actorId: session.staffId, action: 'staff.login', targetType: 'staff_user', targetId: session.staffId, ip: req.ip });
    return session.response;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  @RequireStaffRole('SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN')
  @AuditAction('staff.logout', 'staff_user')
  async logout(@Req() req: any) {
    await this.auth.logout(req.headers['authorization'].slice(7).trim());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(StaffGuard)
  me(@Req() req: any) {
    return req.staffUser;
  }

  @Get('users')
  @UseGuards(StaffGuard)
  @RequireStaffRole(...STAFF_WRITE.admin)
  listUsers() {
    return this.auth.listStaffUsers();
  }

  @Post('users')
  @UseGuards(StaffGuard)
  @RequireStaffRole(...STAFF_WRITE.admin)
  @AuditAction('staff.user_created', 'staff_user')
  createUser(@Body() body: CreateStaffDto) {
    return this.auth.createStaffUser(body.email, body.display_name, body.role, body.password);
  }

  @Post('users/:id/reset-totp')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  @RequireStaffRole(...STAFF_WRITE.admin)
  @AuditAction('staff.totp_reset', 'staff_user')
  resetTotp(@Param('id', ParseUUIDPipe) id: string) {
    return this.auth.resetTotp(id);
  }
}
