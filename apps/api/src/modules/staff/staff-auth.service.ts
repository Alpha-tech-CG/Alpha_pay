import { ForbiddenException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient, StaffRole } from '@paybrain/database';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { ApiError } from '../../common/errors/api-error';
import { KvStore } from '../../common/kv/kv-store';
import { decryptField, encryptField } from '../../common/security/pii-crypto';
import { generateTotpSecret, totpUri, verifyTotp } from '../../common/security/totp';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // journée de travail
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ENROLL_TTL_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const MAX_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;

/**
 * Jetons aléatoires de 256 bits : un SHA-256 suffit pour les stocker (pas de
 * secret serveur à gérer). Le préfixe sépare les usages : un jeton d'étape OTP
 * ou d'enrôlement ne vaut jamais comme session.
 */
function hashToken(kind: 'session' | 'otp' | 'enroll', token: string): string {
  return createHash('sha256').update(`${kind}:${token}`).digest('hex');
}

/** Secret TOTP chiffré au repos (AES-256-GCM, clé PII), stocké en base64. */
const sealSecret = (secret: string) => Buffer.from(encryptField(secret)).toString('base64');
const openSecret = (sealed: string) => decryptField(Buffer.from(sealed, 'base64'));

export interface StaffTokenPayload {
  staffId: string;
  email: string;
  role: StaffRole;
}

/**
 * Comptes du personnel AlphaPay (§M12, T-90) : mot de passe PUIS code TOTP,
 * toujours. Un compte sans application d'authentification ne reçoit jamais de
 * session : la connexion le fait d'abord enrôler (secret + confirmation d'un code).
 */
@Injectable()
export class StaffAuthService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly kv: KvStore,
  ) {}

  // ─── Connexion étape 1 : email + mot de passe ─────────────────────────────

  async loginPassword(email: string, password: string, ip?: string) {
    const normalized = String(email ?? '').trim().toLowerCase();
    await this.assertNotLocked(normalized);
    const user = await this.prisma.staffUser.findUnique({ where: { email: normalized } });
    const ok = user?.isActive ? await bcrypt.compare(String(password ?? ''), user.passwordHash) : false;
    if (!user || !ok) {
      await this.failure(normalized);
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.totpEnabled && user.totpSecretEnc) {
      const otpToken = await this.challenge(user.id, 'otp', CHALLENGE_TTL_MS, ip);
      return { step: 'otp', otp_token: otpToken };
    }

    // Premier accès (ou OTP réinitialisé) : enrôlement obligatoire avant toute session.
    const secret = generateTotpSecret();
    await this.prisma.staffUser.update({ where: { id: user.id }, data: { totpSecretEnc: sealSecret(secret), totpEnabled: false } });
    const enrollToken = await this.challenge(user.id, 'enroll', ENROLL_TTL_MS, ip);
    return { step: 'enroll', enroll_token: enrollToken, secret, otpauth_url: totpUri(secret, user.email) };
  }

  // ─── Connexion étape 2 : code TOTP ────────────────────────────────────────

  async loginOtp(otpToken: string, code: string, ip?: string) {
    const user = await this.consumeChallenge('otp', otpToken);
    await this.checkCode(user, code);
    return this.issueSession(user.id, ip);
  }

  /** Enrôlement : le premier code valide active le TOTP et ouvre la session. */
  async enroll(enrollToken: string, code: string, ip?: string) {
    const user = await this.consumeChallenge('enroll', enrollToken);
    await this.checkCode(user, code);
    await this.prisma.staffUser.update({ where: { id: user.id }, data: { totpEnabled: true } });
    return this.issueSession(user.id, ip);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async verifyToken(token: string): Promise<StaffTokenPayload> {
    const session = await this.prisma.staffSession.findUnique({
      where: { tokenHash: hashToken('session', token) },
      include: { staff: true },
    });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException('Session expirée');
    if (!session.staff.isActive) throw new ForbiddenException('Compte désactivé');
    if (!session.staff.totpEnabled) throw new UnauthorizedException('Authentification à deux facteurs requise');
    return { staffId: session.staff.id, email: session.staff.email, role: session.staff.role };
  }

  async logout(token: string) {
    await this.prisma.staffSession.deleteMany({ where: { tokenHash: hashToken('session', token) } });
  }

  // ─── Gestion des comptes (super-administrateur) ───────────────────────────

  async createStaffUser(email: string, displayName: string, role: StaffRole, plainPassword: string) {
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
    return this.prisma.staffUser.create({
      data: { email: email.trim().toLowerCase(), displayName, role, passwordHash },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
  }

  listStaffUsers() {
    return this.prisma.staffUser.findMany({
      select: { id: true, email: true, displayName: true, role: true, isActive: true, totpEnabled: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setActive(staffId: string, active: boolean) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!user) throw new NotFoundException('Agent introuvable');
    await this.prisma.$transaction([
      this.prisma.staffUser.update({ where: { id: staffId }, data: { isActive: active } }),
      ...(active ? [] : [this.prisma.staffSession.deleteMany({ where: { staffId } })]),
    ]);
    return { is_active: active };
  }

  /** Réinitialise l'OTP d'un agent (perte du téléphone) : il sera enrôlé à sa prochaine connexion. */
  async resetTotp(staffId: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!user) throw new NotFoundException('Agent introuvable');
    await this.prisma.$transaction([
      this.prisma.staffUser.update({ where: { id: staffId }, data: { totpEnabled: false, totpSecretEnc: null } }),
      this.prisma.staffSession.deleteMany({ where: { staffId } }),
    ]);
    return { totp_enabled: false };
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  private async challenge(staffId: string, kind: 'otp' | 'enroll', ttlMs: number, ip?: string) {
    const token = randomBytes(32).toString('hex');
    await this.prisma.staffSession.create({ data: { staffId, tokenHash: hashToken(kind, token), ip, expiresAt: new Date(Date.now() + ttlMs) } });
    return token;
  }

  /** Jeton d'étape à usage unique : supprimé dès sa première présentation. */
  private async consumeChallenge(kind: 'otp' | 'enroll', token: string) {
    const tokenHash = hashToken(kind, String(token ?? ''));
    const session = await this.prisma.staffSession.findUnique({ where: { tokenHash }, include: { staff: true } });
    if (!session) throw new UnauthorizedException('Étape de connexion expirée, recommencez');
    await this.prisma.staffSession.delete({ where: { tokenHash } }).catch(() => undefined);
    if (session.expiresAt < new Date() || !session.staff.isActive) throw new UnauthorizedException('Étape de connexion expirée, recommencez');
    return session.staff;
  }

  private async checkCode(user: { id: string; email: string; totpSecretEnc: string | null }, code: string) {
    await this.assertNotLocked(user.email);
    if (!user.totpSecretEnc) throw new UnauthorizedException('OTP non configuré');
    const step = verifyTotp(openSecret(user.totpSecretEnc), code);
    // Un code déjà utilisé (même pas de 30 s) est refusé : pas de rejeu.
    const fresh = step !== null && (await this.kv.setIfAbsent(`staff:totp:${user.id}:${step}`, '1', 120));
    if (!fresh) {
      await this.failure(user.email);
      throw new UnauthorizedException('Code invalide');
    }
    await this.kv.del(`staff:fail:${user.email}`);
  }

  private async assertNotLocked(email: string) {
    if (await this.kv.get(`staff:lock:${email}`)) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'trop_de_tentatives', 'Trop d’échecs : compte bloqué 15 minutes');
    }
  }

  private async failure(email: string) {
    const n = await this.kv.incr(`staff:fail:${email}`, LOCK_SECONDS);
    if (n >= MAX_FAILURES) await this.kv.set(`staff:lock:${email}`, '1', LOCK_SECONDS);
  }

  private async issueSession(staffId: string, ip?: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.staffSession.create({ data: { staffId, tokenHash: hashToken('session', token), ip, expiresAt } });
    const staff = await this.prisma.staffUser.update({ where: { id: staffId }, data: { lastLoginAt: new Date() }, select: { id: true, email: true, displayName: true, role: true } });
    return { staffId, response: { token, expires_at: expiresAt, staff } };
  }
}
