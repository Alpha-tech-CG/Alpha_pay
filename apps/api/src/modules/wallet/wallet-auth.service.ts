import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@paybrain/database';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { LoginWalletDto, RegisterWalletDto, ResendOtpDto, VerifyOtpDto } from './dto/wallet.dto';
import { NotificationService } from '../notifications/notification.service';
import { MetricsService } from '../metrics/metrics.service';

const FALLBACK_SECRET = 'dev-secret-change-in-prod';

/* ── OTP d'inscription (ALP-171) ── */
const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const OTP_MAX_ATTEMPTS = 3;

/* ── Verrouillage progressif du PIN (ALP-173) ──
   Le rate limit IP (10/15 min) ne protège pas contre un botnet distribué :
   un PIN 4 chiffres = 10 000 combinaisons. Paliers par COMPTE : */
function lockDurationMinutes(failedAttempts: number): number {
  if (failedAttempts >= 15) return 24 * 60; // 24 h + SMS d'alerte
  if (failedAttempts >= 10) return 60;      // 1 h
  if (failedAttempts >= 5) return 15;       // 15 min
  return 0;
}

/** Hash Argon2id factice pour égaliser le temps de réponse quand le compte n'existe pas. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class WalletAuthService implements OnModuleInit {
  private readonly logger = new Logger(WalletAuthService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsService,
  ) {}

  /* W3 — Refus de démarrage si le secret JWT est le fallback de dev. */
  onModuleInit() {
    const secret =
      this.config.get<string>('WALLET_JWT_SECRET') ??
      this.config.get<string>('JWT_SECRET');

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (!secret || secret === FALLBACK_SECRET) {
      if (isProduction) {
        // En production : crash immédiat — ne jamais démarrer sans secret fort
        throw new InternalServerErrorException(
          '[WALLET] WALLET_JWT_SECRET non configuré — démarrage refusé en production. ' +
          'Générez un secret avec : openssl rand -base64 48',
        );
      }
      this.logger.warn(
        '[WALLET] WALLET_JWT_SECRET utilise la valeur par défaut de développement. ' +
        'Définissez WALLET_JWT_SECRET en production.',
      );
    }
  }

  /* ── Inscription : compte PENDING_VERIFICATION + OTP SMS (ALP-171) ── */

  async register(dto: RegisterWalletDto) {
    const phone = dto.phone.replace(/\s/g, '');

    const existing = await this.prisma.wallet.findUnique({ where: { phone } });

    // Un compte déjà VÉRIFIÉ est définitivement pris. Un compte jamais vérifié
    // peut être ré-enregistré : sans ça, n'importe qui pourrait préempter le
    // numéro d'un tiers en s'inscrivant sans jamais valider l'OTP.
    if (existing && existing.status !== 'PENDING_VERIFICATION') {
      throw new ConflictException('Ce numéro est déjà enregistré');
    }

    const pinHash = await argon2.hash(dto.pin, { type: argon2.argon2id });
    const { otp, otpHash, otpExpiresAt } = await this.#generateOtp();

    const wallet = existing
      ? await this.prisma.wallet.update({
          where: { id: existing.id },
          data: { fullName: dto.fullName, pinHash, otpHash, otpExpiresAt, otpAttempts: 0 },
          select: { id: true, phone: true },
        })
      : await this.prisma.wallet.create({
          data: {
            phone,
            fullName: dto.fullName,
            pinHash,
            currency: 'XAF',
            status: 'PENDING_VERIFICATION',
            otpHash,
            otpExpiresAt,
          },
          select: { id: true, phone: true },
        });

    await this.#sendOtp(wallet.phone, otp);

    this.logger.log(`Wallet en attente de vérification : ${wallet.id} (${phone})`);
    return { ok: true, phone: wallet.phone, requiresVerification: true };
  }

  /* ── Vérification OTP : active le compte et connecte directement ── */

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = dto.phone.replace(/\s/g, '');
    const wallet = await this.prisma.wallet.findUnique({ where: { phone } });

    if (!wallet) throw new BadRequestException('Aucune vérification en attente pour ce numéro');
    if (wallet.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Ce compte est déjà vérifié — connectez-vous');
    }
    if (!wallet.otpHash || !wallet.otpExpiresAt || wallet.otpExpiresAt < new Date()) {
      throw new BadRequestException('Code expiré — demandez un nouveau code');
    }
    if (wallet.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Trop de tentatives — demandez un nouveau code');
    }

    const valid = await argon2.verify(wallet.otpHash, dto.otp).catch(() => false);
    if (!valid) {
      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Code incorrect');
    }

    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { status: 'ACTIVE', otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
    });

    this.logger.log(`Wallet vérifié et activé : ${wallet.id}`);

    // Connexion directe après vérification (le PIN vient d'être choisi à l'inscription).
    const token = this.jwt.sign(
      { sub: wallet.id, phone: wallet.phone, role: wallet.role },
      { expiresIn: '30d' },
    );
    return { ok: true, token, phone: wallet.phone, role: wallet.role };
  }

  /* ── Renvoi d'OTP (rate-limité au niveau /v1/wallet/auth) ── */

  async resendOtp(dto: ResendOtpDto) {
    const phone = dto.phone.replace(/\s/g, '');
    const wallet = await this.prisma.wallet.findUnique({ where: { phone } });

    // Réponse identique que le compte existe ou non (pas d'énumération de numéros).
    if (!wallet || wallet.status !== 'PENDING_VERIFICATION') {
      return { ok: true };
    }

    const { otp, otpHash, otpExpiresAt } = await this.#generateOtp();
    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { otpHash, otpExpiresAt, otpAttempts: 0 },
    });
    await this.#sendOtp(wallet.phone, otp);

    this.logger.log(`OTP renvoyé : ${wallet.id}`);
    return { ok: true };
  }

  /**
   * Vérifie phone + PIN (anti-timing) et renvoie le wallet ACTIF.
   * Applique le verrouillage progressif par compte (ALP-173).
   * Utilisé par le login ET par le checkout web (paiement sans session).
   */
  async verifyPin(rawPhone: string, pin: string) {
    const phone = rawPhone.replace(/\s/g, '');

    const wallet = await this.prisma.wallet.findUnique({ where: { phone } });

    // Vérification contre un hash factice si le wallet n'existe pas (anti-timing)
    if (!wallet) {
      await argon2.verify(DUMMY_HASH, pin).catch(() => {});
      throw new UnauthorizedException('Numéro ou PIN incorrect');
    }

    if (wallet.status === 'PENDING_VERIFICATION') {
      throw new UnauthorizedException('Compte non vérifié — validez le code reçu par SMS');
    }
    if (wallet.status !== 'ACTIVE') {
      throw new UnauthorizedException('Ce compte est suspendu');
    }

    if (wallet.lockedUntil && wallet.lockedUntil > new Date()) {
      this.metrics.walletPinFailuresTotal.inc({ result: 'locked' });
      const minutes = Math.ceil((wallet.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Compte temporairement verrouillé — réessayez dans ${minutes} min`);
    }

    const valid = await argon2.verify(wallet.pinHash, pin).catch(() => false);
    if (!valid) {
      await this.#recordPinFailure(wallet.id, wallet.failedPinAttempts + 1, wallet.phone);
      throw new UnauthorizedException('Numéro ou PIN incorrect');
    }

    // Succès : remise à zéro du compteur d'échecs.
    if (wallet.failedPinAttempts > 0 || wallet.lockedUntil) {
      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { failedPinAttempts: 0, lockedUntil: null },
      });
    }

    return wallet;
  }

  async login(dto: LoginWalletDto) {
    const wallet = await this.verifyPin(dto.phone, dto.pin);

    const token = this.jwt.sign(
      { sub: wallet.id, phone: wallet.phone, role: wallet.role },
      { expiresIn: '30d' },
    );

    this.logger.log(`Connexion client : ${wallet.id}`);
    return { token, phone: wallet.phone, role: wallet.role };
  }

  /* ── Privé ── */

  async #generateOtp() {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = await argon2.hash(otp, { type: argon2.argon2id });
    return { otp, otpHash, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) };
  }

  async #sendOtp(phone: string, otp: string) {
    try {
      await this.notifications.send({
        channel: 'SMS',
        to: phone,
        template: 'wallet.otp',
        data: { otp },
        category: 'wallet',
      });
    } catch (err) {
      // L'inscription reste valide — l'utilisateur peut demander un renvoi.
      this.logger.error(`Envoi OTP échoué vers ${phone}: ${err}`);
    }
  }

  async #recordPinFailure(walletId: string, attempts: number, phone: string) {
    this.metrics.walletPinFailuresTotal.inc({ result: 'invalid' });

    const lockMinutes = lockDurationMinutes(attempts);
    await this.prisma.wallet.update({
      where: { id: walletId },
      data: {
        failedPinAttempts: { increment: 1 },
        ...(lockMinutes > 0
          ? { lockedUntil: new Date(Date.now() + lockMinutes * 60_000) }
          : {}),
      },
    });

    if (lockMinutes > 0) {
      this.logger.warn(`Wallet ${walletId} verrouillé ${lockMinutes} min après ${attempts} échecs PIN`);
      // SMS d'alerte au titulaire (fire-and-forget) — détection de compromission.
      this.notifications.send({
        channel: 'SMS',
        to: phone,
        template: 'wallet.locked',
        data: { minutes: String(lockMinutes) },
        category: 'wallet',
      }).catch(() => {});
    }
  }
}
