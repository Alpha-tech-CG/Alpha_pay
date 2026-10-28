import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient, StaffRole } from '@paybrain/database';
import * as bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'crypto';
import { TOTP, verifySync } from '@otplib/totp';
import { generateSecret } from '@otplib/core';
import base32Plugin from '@otplib/plugin-base32-scure';
import cryptoPlugin from '@otplib/plugin-crypto-noble';

const totp = new TOTP({ base32: base32Plugin, crypto: cryptoPlugin } as any);

const authenticator = {
  verify: ({ token, secret }: { token: string; secret: string }) =>
    verifySync({ token, secret, base32: base32Plugin, crypto: cryptoPlugin } as any),
  generateSecret: () => (totp as any).generateSecret() as string,
  keyuri: (user: string, service: string, secret: string) =>
    `otpauth://totp/${encodeURIComponent(service)}:${encodeURIComponent(user)}?secret=${secret}&issuer=${encodeURIComponent(service)}`,
};

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h
const BCRYPT_ROUNDS = 12;

function hashToken(token: string): string {
  return createHmac('sha256', process.env.APP_SECRET ?? 'dev_secret').update(token).digest('hex');
}

function encryptTotp(secret: string): string {
  // Chiffrement symétrique minimal (XOR avec la clé d'app encodée en base64) —
  // en production remplacer par AES-256-GCM via KMS ou Vault.
  const key = Buffer.from(process.env.APP_SECRET ?? 'dev_secret_32bytespadding!!!', 'utf8').slice(0, 32);
  const buf = Buffer.from(secret, 'utf8');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out.toString('base64');
}

function decryptTotp(enc: string): string {
  const key = Buffer.from(process.env.APP_SECRET ?? 'dev_secret_32bytespadding!!!', 'utf8').slice(0, 32);
  const buf = Buffer.from(enc, 'base64');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out.toString('utf8');
}

export interface StaffTokenPayload {
  staffId: string;
  email: string;
  role: StaffRole;
}

@Injectable()
export class StaffAuthService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  // ─── Connexion étape 1 : email + mot de passe ─────────────────────────────

  async loginPassword(email: string, password: string, ip?: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new UnauthorizedException('Identifiants invalides');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    if (user.totpEnabled) {
      // Renvoie un jeton temporaire OTP (valable 5 min) au lieu d'une session complète
      const otpToken = randomBytes(24).toString('hex');
      const tokenHash = hashToken(`otp:${otpToken}`);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await this.prisma.staffSession.create({ data: { staffId: user.id, tokenHash, ip, expiresAt } });
      return { requires_otp: true, otp_token: otpToken };
    }

    return this.issueSession(user.id, ip);
  }

  // ─── Connexion étape 2 : OTP TOTP ─────────────────────────────────────────

  async loginOtp(otpToken: string, totpCode: string, ip?: string) {
    const tokenHash = hashToken(`otp:${otpToken}`);
    const session = await this.prisma.staffSession.findUnique({ where: { tokenHash } });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException('Session OTP expirée');

    const user = await this.prisma.staffUser.findUnique({ where: { id: session.staffId } });
    if (!user || !user.totpEnabled || !user.totpSecretEnc) throw new UnauthorizedException('OTP non configuré');

    const secret = decryptTotp(user.totpSecretEnc);
    const valid = authenticator.verify({ token: totpCode.replace(/\s/g, ''), secret });
    if (!valid) throw new UnauthorizedException('Code OTP invalide');

    // Supprime le jeton temporaire et crée une vraie session
    await this.prisma.staffSession.delete({ where: { tokenHash } });
    return this.issueSession(user.id, ip);
  }

  // ─── Vérification d'un jeton de session ───────────────────────────────────

  async verifyToken(token: string): Promise<StaffTokenPayload> {
    const tokenHash = hashToken(token);
    const session = await this.prisma.staffSession.findUnique({
      where: { tokenHash },
      include: { staff: true },
    });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException('Session expirée');
    if (!session.staff.isActive) throw new ForbiddenException('Compte désactivé');

    return { staffId: session.staff.id, email: session.staff.email, role: session.staff.role };
  }

  // ─── Déconnexion ──────────────────────────────────────────────────────────

  async logout(token: string) {
    const tokenHash = hashToken(token);
    await this.prisma.staffSession.deleteMany({ where: { tokenHash } });
  }

  // ─── Initialisation OTP ───────────────────────────────────────────────────

  async setupTotp(staffId: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const secret = authenticator.generateSecret();
    const enc = encryptTotp(secret);
    await this.prisma.staffUser.update({ where: { id: staffId }, data: { totpSecretEnc: enc } });
    const otpauthUrl = authenticator.keyuri(user.email, 'AlphaPay Back-office', secret);
    return { otpauth_url: otpauthUrl, secret };
  }

  async confirmTotp(staffId: string, code: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!user?.totpSecretEnc) throw new BadRequestException('OTP non initialisé');
    const secret = decryptTotp(user.totpSecretEnc);
    if (!authenticator.verify({ token: code.replace(/\s/g, ''), secret })) {
      throw new BadRequestException('Code OTP invalide');
    }
    await this.prisma.staffUser.update({ where: { id: staffId }, data: { totpEnabled: true } });
    return { totp_enabled: true };
  }

  // ─── Gestion des comptes (SUPER_ADMIN) ────────────────────────────────────

  async createStaffUser(email: string, displayName: string, role: StaffRole, plainPassword: string) {
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
    return this.prisma.staffUser.create({
      data: { email: email.toLowerCase(), displayName, role, passwordHash },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
  }

  listStaffUsers() {
    return this.prisma.staffUser.findMany({
      select: { id: true, email: true, displayName: true, role: true, isActive: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async issueSession(staffId: string, ip?: string) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.staffSession.create({ data: { staffId, tokenHash, ip, expiresAt } });
    await this.prisma.staffUser.update({ where: { id: staffId }, data: { lastLoginAt: new Date() } });
    return { token, expires_at: expiresAt };
  }
}
