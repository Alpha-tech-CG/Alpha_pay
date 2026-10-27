import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppUser, MessageChannel, Prisma, PrismaClient } from '@paybrain/database';
import { toE164 } from '@paybrain/shared';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { KvStore } from '../../common/kv/kv-store';
import { decryptField, deterministicHash, encryptField, maskEmail, maskPhone, normalizeEmail } from '../../common/security/pii-crypto';
import { OTP_TTL_SECONDS, OtpService } from '../messaging/otp.service';
import { assertPasswordStrength, hashPassword, verifyPassword } from './password';
import { hashToken, IssuedTokens, SessionService } from './session.service';

type Purpose = 'inscription' | 'connexion' | 'reinitialisation';

interface Challenge {
  userId: string | null; // null = identifiant inconnu (réinitialisation sans énumération)
  purpose: Purpose;
  channel: MessageChannel;
  destination: string;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface ChallengeResponse {
  challenge: string;
  channel: string;
  to?: string;
  expires_in: number;
}

const MAX_LOGIN_FAILURES = 10;
const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
const b = (buf: Buffer) => new Uint8Array(buf);

/**
 * Comptes et authentification (§M1) : inscription marchand, connexion en deux
 * étapes (mot de passe Argon2id puis code à usage unique par SMS, WhatsApp ou
 * email), réinitialisation par code, sessions révocables.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly kv: KvStore,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  // ── Identité ───────────────────────────────────────────────────────────────

  private normalizePhone(phone: string): string {
    try {
      return toE164(phone);
    } catch (err: any) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'telephone_invalide', err.message, 'phone');
    }
  }

  /** Retrouve un compte par email ou par téléphone. */
  private async findByIdentifier(identifier: string): Promise<AppUser | null> {
    const value = (identifier ?? '').trim();
    if (value.includes('@')) {
      return this.prisma.appUser.findUnique({ where: { emailHash: b(deterministicHash(normalizeEmail(value))) } });
    }
    let phone: string;
    try {
      phone = toE164(value);
    } catch {
      return null;
    }
    return this.prisma.appUser.findUnique({ where: { phoneHash: b(deterministicHash(phone)) } });
  }

  private destinationFor(user: AppUser, channel: MessageChannel): string {
    if (channel === 'EMAIL') return decryptField(user.emailEncrypted);
    if (!user.phoneEncrypted) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'canal_indisponible', 'Aucun numéro enregistré : choisissez l’email', 'channel');
    }
    return decryptField(user.phoneEncrypted);
  }

  // ── Défis (étape « code ») ──────────────────────────────────────────────────

  private async issueChallenge(c: Challenge, ctx: RequestContext, send: boolean): Promise<ChallengeResponse> {
    const token = randomBytes(32).toString('base64url');
    if (send) {
      await this.otp.send({
        merchantId: null,
        livemode: false,
        destination: c.destination,
        channel: c.channel,
        // WhatsApp indisponible → SMS (§M9).
        fallback: c.channel === 'WHATSAPP' ? ['SMS'] : [],
        purpose: c.purpose,
        ip: ctx.ip,
      });
    }
    await this.kv.set(`auth:challenge:${hashToken(token)}`, JSON.stringify(c), OTP_TTL_SECONDS);
    return {
      challenge: token,
      channel: c.channel.toLowerCase(),
      ...(c.userId ? { to: c.channel === 'EMAIL' ? maskEmail(c.destination) : maskPhone(c.destination) } : {}),
      expires_in: OTP_TTL_SECONDS,
    };
  }

  private async readChallenge(token: string): Promise<Challenge> {
    const raw = token ? await this.kv.get(`auth:challenge:${hashToken(token)}`) : null;
    if (!raw) throw new ApiError(HttpStatus.BAD_REQUEST, 'defi_expire', 'Demande expirée : recommencez.', 'challenge');
    return JSON.parse(raw) as Challenge;
  }

  private async checkCode(token: string, code: string, ctx: RequestContext, purposes: Purpose[]): Promise<Challenge> {
    const c = await this.readChallenge(token);
    if (!purposes.includes(c.purpose)) throw new ApiError(HttpStatus.BAD_REQUEST, 'defi_expire', 'Demande expirée : recommencez.', 'challenge');
    if (!c.userId) throw new ApiError(HttpStatus.BAD_REQUEST, 'otp_invalide', 'Code invalide ou expiré.', 'code');
    await this.otp.verify({
      merchantId: null,
      livemode: false,
      destination: c.destination,
      channel: c.channel,
      purpose: c.purpose,
      code,
      ip: ctx.ip,
      onLocked: () =>
        this.audit.record({ actorType: 'user', actorId: c.userId, action: 'auth.otp_locked', ip: ctx.ip, metadata: { purpose: c.purpose } }),
    });
    await this.kv.del(`auth:challenge:${hashToken(token)}`);
    return c;
  }

  // ── Inscription ────────────────────────────────────────────────────────────

  async register(
    input: { name: string; phone: string; email: string; password: string; channel?: MessageChannel },
    ctx: RequestContext,
  ): Promise<ChallengeResponse> {
    const email = normalizeEmail(input.email);
    const phone = this.normalizePhone(input.phone);
    assertPasswordStrength(input.password, { email, phone });
    const emailHash = b(deterministicHash(email));
    const phoneHash = b(deterministicHash(phone));
    const name = input.name.trim();

    const taken = await this.prisma.appUser.findFirst({ where: { OR: [{ emailHash }, { phoneHash }] }, select: { id: true } });
    if (taken) throw new ApiError(HttpStatus.CONFLICT, 'compte_existant', 'Un compte existe déjà avec cet email ou ce numéro.');

    const passwordHash = await hashPassword(input.password);
    const channel = input.channel ?? 'SMS';
    let user: AppUser;
    try {
      user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.appUser.create({
          data: {
            emailEncrypted: b(encryptField(email)),
            emailHash,
            phoneEncrypted: b(encryptField(phone)),
            phoneHash,
            phoneMasked: maskPhone(phone),
            fullName: name,
            passwordHash,
            preferredOtpChannel: channel,
          },
        });
        // Mode test disponible dès l'inscription ; le live attend la validation du KYB (§4.6).
        const merchant = await tx.merchant.create({
          data: {
            name,
            emailEncrypted: b(encryptField(email)),
            emailHash,
            onboardingStatus: 'PENDING',
            isActive: true,
            ownerUserId: created.id,
          },
        });
        await tx.merchantMember.create({
          data: { merchantId: merchant.id, userId: created.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
        });
        return created;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'compte_existant', 'Un compte existe déjà avec cet email ou ce numéro.');
      throw err;
    }

    await this.audit.record({ actorType: 'user', actorId: user.id, action: 'auth.registered', ip: ctx.ip });
    return this.issueChallenge(
      { userId: user.id, purpose: 'inscription', channel, destination: channel === 'EMAIL' ? email : phone },
      ctx,
      true,
    );
  }

  // ── Connexion : mot de passe, puis code ────────────────────────────────────

  async login(input: { identifier: string; password: string; channel?: MessageChannel }, ctx: RequestContext): Promise<ChallengeResponse> {
    const failKey = `auth:login-fail:${hashToken((input.identifier ?? '').trim().toLowerCase())}`;
    const failures = Number((await this.kv.get(failKey)) ?? 0);
    if (failures >= MAX_LOGIN_FAILURES) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'trop_de_tentatives', 'Trop de tentatives : réessayez dans 15 minutes.');
    }

    const user = await this.findByIdentifier(input.identifier);
    const ok = await verifyPassword(user?.passwordHash, input.password ?? '');
    if (!user || !ok || user.status !== 'ACTIVE') {
      await this.kv.incr(failKey, LOGIN_FAILURE_WINDOW_SECONDS);
      await this.audit.record({ actorType: 'user', actorId: user?.id ?? null, action: 'auth.login_failed', ip: ctx.ip });
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'identifiants_invalides', 'Identifiant ou mot de passe incorrect.');
    }

    const channel = input.channel ?? user.preferredOtpChannel;
    return this.issueChallenge({ userId: user.id, purpose: 'connexion', channel, destination: this.destinationFor(user, channel) }, ctx, true);
  }

  /** Étape 2 (inscription ou connexion) : le code ouvre une session. */
  async verify(input: { challenge: string; code: string }, ctx: RequestContext): Promise<IssuedTokens & { user: Awaited<ReturnType<AuthService['me']>> }> {
    const c = await this.checkCode(input.challenge, input.code, ctx, ['inscription', 'connexion']);
    const now = new Date();
    await this.prisma.appUser.update({
      where: { id: c.userId! },
      data: { lastLoginAt: now, ...(c.channel === 'EMAIL' ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }) },
    });
    // Un compte désactivé entre-temps ne reçoit pas de session.
    const user = await this.prisma.appUser.findUniqueOrThrow({ where: { id: c.userId! } });
    if (user.status !== 'ACTIVE') throw new ApiError(HttpStatus.UNAUTHORIZED, 'identifiants_invalides', 'Identifiant ou mot de passe incorrect.');
    const tokens = await this.sessions.create(user.id, ctx);
    await this.audit.record({ actorType: 'user', actorId: user.id, action: 'auth.login_succeeded', targetType: 'session', targetId: tokens.session.id, ip: ctx.ip });
    return { ...tokens, user: await this.me(user.id) };
  }

  // ── Réinitialisation du mot de passe ───────────────────────────────────────

  /** Réponse identique que le compte existe ou non (pas d'énumération). */
  async forgotPassword(input: { identifier: string; channel?: MessageChannel }, ctx: RequestContext): Promise<ChallengeResponse> {
    const user = await this.findByIdentifier(input.identifier);
    const channel = input.channel ?? user?.preferredOtpChannel ?? 'SMS';
    if (!user || user.status !== 'ACTIVE' || (channel !== 'EMAIL' && !user.phoneEncrypted)) {
      const fake = await this.issueChallenge({ userId: null, purpose: 'reinitialisation', channel, destination: '' }, ctx, false);
      return { challenge: fake.challenge, channel: fake.channel, expires_in: fake.expires_in };
    }
    const real = await this.issueChallenge(
      { userId: user.id, purpose: 'reinitialisation', channel, destination: this.destinationFor(user, channel) },
      ctx,
      true,
    );
    return { challenge: real.challenge, channel: real.channel, expires_in: real.expires_in };
  }

  async resetPassword(input: { challenge: string; code: string; password: string }, ctx: RequestContext): Promise<{ ok: true }> {
    const c = await this.checkCode(input.challenge, input.code, ctx, ['reinitialisation']);
    const user = await this.prisma.appUser.findUniqueOrThrow({ where: { id: c.userId! } });
    assertPasswordStrength(input.password, {
      email: decryptField(user.emailEncrypted),
      phone: user.phoneEncrypted ? decryptField(user.phoneEncrypted) : undefined,
    });
    await this.prisma.appUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.password) } });
    // Un mot de passe changé ferme toutes les sessions ouvertes.
    const revoked = await this.sessions.revokeAll(user.id, 'mot_de_passe_reinitialise');
    await this.audit.record({ actorType: 'user', actorId: user.id, action: 'auth.password_reset', ip: ctx.ip, metadata: { sessionsRevoked: revoked } });
    return { ok: true };
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async logout(sessionId: string, userId: string, ctx: RequestContext): Promise<void> {
    await this.sessions.revoke(sessionId, 'deconnexion');
    await this.audit.record({ actorType: 'user', actorId: userId, action: 'auth.logout', targetType: 'session', targetId: sessionId, ip: ctx.ip });
  }

  async logoutAll(userId: string, ctx: RequestContext): Promise<number> {
    const count = await this.sessions.revokeAll(userId, 'deconnexion_globale');
    await this.audit.record({ actorType: 'user', actorId: userId, action: 'auth.logout_all', ip: ctx.ip, metadata: { sessionsRevoked: count } });
    return count;
  }

  /** Profil et accès de l'utilisateur connecté. */
  async me(userId: string) {
    const user = await this.prisma.appUser.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          select: { role: true, merchant: { select: { id: true, name: true, onboardingStatus: true } } },
        },
      },
    });
    return {
      id: user.id,
      fullName: user.fullName,
      email: decryptField(user.emailEncrypted),
      phone: user.phoneMasked,
      emailVerified: !!user.emailVerifiedAt,
      phoneVerified: !!user.phoneVerifiedAt,
      preferredOtpChannel: user.preferredOtpChannel.toLowerCase(),
      merchants: user.memberships.map((m) => ({
        id: m.merchant.id,
        name: m.merchant.name,
        role: m.role,
        kybStatus: m.merchant.onboardingStatus,
      })),
    };
  }
}
