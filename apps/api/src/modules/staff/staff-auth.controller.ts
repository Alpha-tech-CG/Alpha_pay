import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { StaffRole } from '@paybrain/database';
import { StaffGuard } from './staff.guard';
import { StaffAuthService } from './staff-auth.service';

@Controller('internal/staff')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  // ─── Authentification ──────────────────────────────────────────────────────

  @Post('login')
  login(@Body() body: { email: string; password: string }, @Req() req: any) {
    return this.auth.loginPassword(body.email, body.password, req.ip);
  }

  @Post('login/otp')
  loginOtp(@Body() body: { otp_token: string; code: string }, @Req() req: any) {
    return this.auth.loginOtp(body.otp_token, body.code, req.ip);
  }

  @Post('logout')
  @UseGuards(StaffGuard)
  logout(@Req() req: any) {
    const authHeader: string = req.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    return this.auth.logout(token).then(() => ({ ok: true }));
  }

  // ─── OTP setup ─────────────────────────────────────────────────────────────

  @Post('me/totp/setup')
  @UseGuards(StaffGuard)
  setupTotp(@Req() req: any) {
    return this.auth.setupTotp(req.staffUser.staffId);
  }

  @Post('me/totp/confirm')
  @UseGuards(StaffGuard)
  confirmTotp(@Body() body: { code: string }, @Req() req: any) {
    return this.auth.confirmTotp(req.staffUser.staffId, body.code);
  }

  // ─── Gestion des comptes (SUPER_ADMIN uniquement) ─────────────────────────

  @Get('users')
  @UseGuards(StaffGuard)
  listUsers(@Req() req: any) {
    if (req.staffUser.role !== 'SUPER_ADMIN') return [];
    return this.auth.listStaffUsers();
  }

  @Post('users')
  @UseGuards(StaffGuard)
  createUser(
    @Body() body: { email: string; display_name: string; role: StaffRole; password: string },
    @Req() req: any,
  ) {
    if (req.staffUser.role !== 'SUPER_ADMIN') throw new Error('Accès refusé');
    return this.auth.createStaffUser(body.email, body.display_name, body.role, body.password);
  }
}
