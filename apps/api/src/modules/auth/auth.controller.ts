import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { MessageChannel } from '@paybrain/database';
import { ApiError } from '../../common/errors/api-error';
import { AuthService, RequestContext } from './auth.service';
import { ForgotPasswordDto, LoginDto, OtpChannelInput, RefreshDto, RegisterDto, ResetPasswordDto, VerifySessionDto } from './dto/auth.dto';
import { SessionGuard } from './session.guard';
import { IssuedTokens, REFRESH_TOKEN_TTL_DAYS, SessionService } from './session.service';

export const REFRESH_COOKIE = 'ap_refresh';
const CSRF_HEADER = 'x-alphapay-csrf';

const CHANNEL: Record<OtpChannelInput, MessageChannel> = { sms: 'SMS', whatsapp: 'WHATSAPP', email: 'EMAIL' };

function context(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Le jeton de rafraîchissement ne quitte jamais le cookie HttpOnly (jamais
 * lisible par le JavaScript de la page). SameSite=Strict + en-tête
 * personnalisé exigé : un site tiers ne peut pas déclencher un
 * rafraîchissement ni une déconnexion (CSRF, §8.1).
 */
function setRefreshCookie(res: Response, token: string | null) {
  res.cookie(REFRESH_COOKIE, token ?? '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: token ? REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000 : 0,
  });
}

function assertCsrfHeader(req: Request) {
  if (req.headers[CSRF_HEADER] !== '1') {
    throw new ApiError(HttpStatus.FORBIDDEN, 'csrf_requis', `En-tête ${CSRF_HEADER} requis`);
  }
}

function tokenResponse(tokens: IssuedTokens) {
  return { access_token: tokens.accessToken, token_type: 'Bearer', expires_in: tokens.expiresIn };
}

/** Comptes et authentification du tableau de bord marchand (§M1). */
@ApiTags('Authentification')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Inscription marchand ; envoie un code de vérification' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register({ ...dto, channel: dto.channel ? CHANNEL[dto.channel] : undefined }, context(req));
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Étape 1 : mot de passe ; envoie un code (SMS, WhatsApp ou email)' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login({ ...dto, channel: dto.channel ? CHANNEL[dto.channel] : undefined }, context(req));
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Étape 2 : code reçu ; ouvre une session' })
  async verify(@Body() dto: VerifySessionDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.verify({ challenge: dto.challenge, code: dto.code }, context(req));
    // App mobile : pas de cookie, le jeton va dans le stockage sécurisé de l'appareil.
    if (dto.client === 'mobile') return { ...tokenResponse(result), refresh_token: result.refreshToken, user: result.user };
    setRefreshCookie(res, result.refreshToken);
    return { ...tokenResponse(result), user: result.user };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renouvelle le jeton d’accès (cookie de session)' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // App mobile : jeton dans le corps. Aucun cookie en jeu, donc pas de CSRF possible.
    if (dto.refresh_token) {
      const tokens = await this.sessions.rotate(dto.refresh_token);
      return { ...tokenResponse(tokens), refresh_token: tokens.refreshToken };
    }
    assertCsrfHeader(req);
    try {
      const tokens = await this.sessions.rotate(readCookie(req, REFRESH_COOKIE) ?? '');
      setRefreshCookie(res, tokens.refreshToken);
      return tokenResponse(tokens);
    } catch (err) {
      setRefreshCookie(res, null);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Ferme la session courante' })
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.appUser.sessionId, req.appUser.id, context(req));
    setRefreshCookie(res, null);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Ferme toutes les sessions du compte' })
  async logoutAll(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const revoked = await this.auth.logoutAll(req.appUser.id, context(req));
    setRefreshCookie(res, null);
    return { ok: true, sessions_revoked: revoked };
  }

  @Get('sessions')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Sessions ouvertes du compte' })
  async listSessions(@Req() req: any) {
    const sessions = await this.sessions.listActive(req.appUser.id);
    return { data: sessions.map((s) => ({ ...s, current: s.id === req.appUser.sessionId })) };
  }

  @Post('password/forgot')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réinitialisation : envoie un code si le compte existe (réponse identique sinon)' })
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword({ ...dto, channel: dto.channel ? CHANNEL[dto.channel] : undefined }, context(req));
  }

  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réinitialisation : code + nouveau mot de passe ; ferme toutes les sessions' })
  reset(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, context(req));
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Profil et marchands de l’utilisateur connecté' })
  me(@Req() req: any) {
    return this.auth.me(req.appUser.id);
  }
}
