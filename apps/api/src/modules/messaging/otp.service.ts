import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import { MessageChannel, PrismaClient } from '@paybrain/database';
import { toE164 } from '@paybrain/shared';
import { ApiError } from '../../common/errors/api-error';
import { KvStore } from '../../common/kv/kv-store';
import { deterministicHash, maskEmail, maskPhone, normalizeEmail } from '../../common/security/pii-crypto';
import { MessagingService } from './messaging.service';

export const OTP_TTL_SECONDS = 300; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_SECONDS = 900; // 15 minutes
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

function limit(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

function otpSecret(): string {
  const s = process.env.OTP_HMAC_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('OTP_HMAC_SECRET (≥32 caractères) requis en production');
  return 'dev-only-otp-secret-not-for-production-0000';
}

export interface OtpScope {
  /** null = OTP d'AlphaPay (connexion, réinitialisation) ; sinon OTP d'un marchand (API). */
  merchantId: string | null;
  livemode: boolean;
}

export interface SendOtpInput extends OtpScope {
  destination: string;
  channel: MessageChannel;
  /** Usage du code : un code de connexion ne valide pas une autre action. */
  purpose: string;
  /** Canaux de bascule (ex. SMS après WhatsApp). */
  fallback?: MessageChannel[];
  ip?: string;
  merchantName?: string;
  chargeCredits?: boolean;
}

export interface VerifyOtpInput extends OtpScope {
  destination: string;
  channel: MessageChannel;
  purpose: string;
  code: string;
  ip?: string;
}

const PURPOSE = /^[a-z0-9_.-]{1,40}$/;

/**
 * Codes à usage unique (§M9) :
 * - 6 chiffres issus d'un générateur cryptographique ;
 * - stockés UNIQUEMENT hachés (HMAC-SHA256, secret serveur) dans Redis, 5 min ;
 * - liés à la paire (destination, usage) et au périmètre (AlphaPay ou marchand, mode) ;
 * - comparaison en temps constant, usage unique, 5 essais puis blocage 15 min ;
 * - 60 s minimum entre deux envois, plafonds par destination et par IP ;
 * - le code n'est jamais journalisé (il ne transite que chiffré jusqu'au fournisseur).
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly kv: KvStore,
    private readonly messaging: MessagingService,
  ) {}

  private normalize(channel: MessageChannel, destination: string): string {
    if (channel === 'EMAIL') {
      const email = normalizeEmail(destination ?? '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'destinataire_invalide', 'Adresse email invalide', 'to');
      }
      return email;
    }
    try {
      return toE164(destination);
    } catch (err: any) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'telephone_invalide', err.message, 'to');
    }
  }

  private keys(scope: OtpScope, purpose: string, destination: string) {
    if (!PURPOSE.test(purpose)) throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', 'Usage du code invalide', 'purpose');
    const dest = deterministicHash(destination).toString('hex');
    const base = `otp:${scope.merchantId ?? 'alphapay'}:${scope.livemode ? 'live' : 'test'}:${purpose}:${dest}`;
    return { dest, code: base, attempts: `${base}:attempts`, lock: `${base}:lock`, cooldown: `${base}:cooldown` };
  }

  private digest(purpose: string, destination: string, code: string): string {
    return createHmac('sha256', otpSecret()).update(`${purpose}:${destination}:${code}`).digest('hex');
  }

  private async audit(scope: OtpScope, purpose: string, channel: MessageChannel, destination: string, event: string, ip?: string) {
    await this.prisma.otpAudit
      .create({
        data: {
          merchantId: scope.merchantId,
          livemode: scope.livemode,
          purpose,
          channel,
          destinationHash: new Uint8Array(deterministicHash(destination)),
          destinationMasked: channel === 'EMAIL' ? maskEmail(destination) : maskPhone(destination),
          event,
          ipHash: ip ? new Uint8Array(createHash('sha256').update(ip).digest()) : null,
        },
      })
      .catch(() => undefined);
  }

  private async rejectIfLocked(k: ReturnType<OtpService['keys']>) {
    const ttl = await this.kv.ttl(k.lock);
    if (ttl > 0) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'otp_bloque',
        `Trop d'essais : réessayez dans ${Math.ceil(ttl / 60)} minute(s).`,
      );
    }
  }

  async send(input: SendOtpInput): Promise<{ id: string; channel: MessageChannel; expiresIn: number }> {
    const destination = this.normalize(input.channel, input.destination);
    const k = this.keys(input, input.purpose, destination);
    await this.rejectIfLocked(k);

    if (!(await this.kv.setIfAbsent(k.cooldown, '1', OTP_RESEND_COOLDOWN_SECONDS))) {
      await this.audit(input, input.purpose, input.channel, destination, 'cooldown', input.ip);
      const ttl = await this.kv.ttl(k.cooldown);
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'otp_trop_frequent', `Patientez ${Math.max(ttl, 1)} s avant de redemander un code.`);
    }

    // Plafonds anti « SMS pumping » : par destination et par adresse IP, sur une heure.
    const perDestination = await this.kv.incr(`otp:rate:dest:${k.dest}`, 3600);
    const perIp = input.ip ? await this.kv.incr(`otp:rate:ip:${createHash('sha256').update(input.ip).digest('hex')}`, 3600) : 0;
    if (perDestination > limit('OTP_MAX_PER_DESTINATION_PER_HOUR', 5) || perIp > limit('OTP_MAX_PER_IP_PER_HOUR', 20)) {
      await this.audit(input, input.purpose, input.channel, destination, 'rate_limited', input.ip);
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'otp_limite_atteinte', 'Trop de codes demandés : réessayez plus tard.');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // Un nouveau code remplace le précédent et remet les essais à zéro.
    await this.kv.set(k.code, this.digest(input.purpose, destination, code), OTP_TTL_SECONDS);
    await this.kv.del(k.attempts);

    try {
      const sent = await this.messaging.send({
        merchantId: input.merchantId,
        livemode: input.livemode,
        channels: [input.channel, ...(input.fallback ?? [])],
        to: input.channel === 'EMAIL' ? { email: destination } : { phone: destination },
        templateKey: input.merchantId ? 'otp.code_marchand' : 'otp.code',
        variables: { code, ...(input.merchantName ? { merchantName: input.merchantName } : {}) },
        category: 'OTP',
        // Un OTP doit arriver vite : peu de tentatives, puis bascule.
        maxAttempts: 2,
        chargeCredits: input.chargeCredits,
      });
      await this.audit(input, input.purpose, input.channel, destination, 'sent', input.ip);
      return { id: sent.id, channel: sent.channel, expiresIn: OTP_TTL_SECONDS };
    } catch (err) {
      // Rien n'est parti (ex. crédits insuffisants) : on n'immobilise ni code ni délai.
      await this.kv.del(k.code);
      await this.kv.del(k.cooldown);
      throw err;
    }
  }

  async verify(input: VerifyOtpInput): Promise<{ valid: true }> {
    const destination = this.normalize(input.channel, input.destination);
    const k = this.keys(input, input.purpose, destination);
    await this.rejectIfLocked(k);

    const stored = await this.kv.get(k.code);
    if (!stored) {
      await this.audit(input, input.purpose, input.channel, destination, 'expired', input.ip);
      throw new ApiError(HttpStatus.BAD_REQUEST, 'otp_invalide', 'Code invalide ou expiré.', 'code');
    }

    // Compteur atomique : au plus 5 comparaisons, même sous requêtes concurrentes.
    const attempts = await this.kv.incr(k.attempts, OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.lock(k, input, destination);
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'otp_bloque', `Trop d'essais : réessayez dans ${OTP_LOCK_SECONDS / 60} minutes.`);
    }

    const candidate = /^\d{6}$/.test(input.code ?? '') ? this.digest(input.purpose, destination, input.code) : '';
    const match = candidate.length === stored.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
    if (!match) {
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.lock(k, input, destination);
        throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'otp_bloque', `Trop d'essais : réessayez dans ${OTP_LOCK_SECONDS / 60} minutes.`);
      }
      await this.audit(input, input.purpose, input.channel, destination, 'invalid', input.ip);
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'otp_invalide',
        `Code invalide. ${OTP_MAX_ATTEMPTS - attempts} essai(s) restant(s).`,
        'code',
      );
    }

    // Usage unique : seule la requête qui supprime le code l'emporte.
    if ((await this.kv.del(k.code)) !== 1) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'otp_invalide', 'Code invalide ou expiré.', 'code');
    }
    await this.kv.del(k.attempts);
    await this.audit(input, input.purpose, input.channel, destination, 'verified', input.ip);
    return { valid: true };
  }

  private async lock(k: ReturnType<OtpService['keys']>, scope: VerifyOtpInput, destination: string) {
    await this.kv.set(k.lock, '1', OTP_LOCK_SECONDS);
    await this.kv.del(k.code);
    await this.kv.del(k.attempts);
    await this.audit(scope, scope.purpose, scope.channel, destination, 'locked', scope.ip);
  }
}
