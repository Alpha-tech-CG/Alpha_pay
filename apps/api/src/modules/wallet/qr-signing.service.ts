import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

const DEV_FALLBACK_SECRET = 'dev-qr-secret-change-in-prod';
const DEFAULT_TTL_SECONDS = 120;

export interface QrData {
  merchantId: string;
  amountCents: number;
  description?: string;
}

export interface VerifiedQr extends QrData {
  nonce: string;
}

interface SignedPayload {
  v: 1;
  merchantId: string;
  amountCents: number;
  description?: string;
  exp: number;   // epoch secondes
  nonce: string;
  sig: string;   // HMAC-SHA256 hex
}

/**
 * Signe et vérifie les payloads QR marchands (ALP-172).
 *
 * Un QR non signé peut être forgé (QR frauduleux collé sur un comptoir qui
 * détourne les paiements) : tout payload accepté par payQr doit provenir de
 * ce service — HMAC serveur, expiration courte, nonce à usage unique
 * (l'unicité est appliquée en base via wallet_transactions.qr_nonce).
 */
@Injectable()
export class QrSigningService implements OnModuleInit {
  private readonly logger = new Logger(QrSigningService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const secret = this.config.get<string>('QR_SIGNING_SECRET');
    if (!secret || secret === DEV_FALLBACK_SECRET) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new InternalServerErrorException(
          '[QR] QR_SIGNING_SECRET non configuré — démarrage refusé en production. ' +
          'Générez un secret avec : openssl rand -hex 32',
        );
      }
      this.logger.warn(
        '[QR] QR_SIGNING_SECRET absent — fallback de développement utilisé. ' +
        'Définissez QR_SIGNING_SECRET en production.',
      );
    }
  }

  /** Génère le payload QR signé (JSON string prêt à encoder en QR code). */
  sign(data: QrData, ttlSeconds = DEFAULT_TTL_SECONDS): { qrPayload: string; expiresAt: string } {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const nonce = randomUUID();
    const sig = this.#hmac(data.merchantId, data.amountCents, data.description, exp, nonce);
    const payload: SignedPayload = {
      v: 1,
      merchantId: data.merchantId,
      amountCents: data.amountCents,
      ...(data.description ? { description: data.description } : {}),
      exp,
      nonce,
      sig,
    };
    return { qrPayload: JSON.stringify(payload), expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Vérifie signature + expiration, renvoie les données de paiement + nonce. */
  verify(raw: string): VerifiedQr {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('QR invalide — JSON malformé');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('QR invalide — structure incorrecte');
    }
    const obj = parsed as Record<string, unknown>;

    const merchantId = obj['merchantId'];
    const amountCents = obj['amountCents'];
    const description = typeof obj['description'] === 'string' ? obj['description'].slice(0, 200) : undefined;
    const exp = obj['exp'];
    const nonce = obj['nonce'];
    const sig = obj['sig'];

    if (typeof merchantId !== 'string' || !merchantId) {
      throw new BadRequestException('QR invalide — merchantId manquant');
    }
    if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('QR invalide — montant incorrect');
    }
    if (typeof exp !== 'number' || typeof nonce !== 'string' || typeof sig !== 'string' || !nonce || !sig) {
      throw new BadRequestException('QR non signé — utilisez un QR généré par PayBrain');
    }
    if (exp < Math.floor(Date.now() / 1000)) {
      throw new BadRequestException('QR expiré — demandez au marchand de le régénérer');
    }

    const expected = this.#hmac(merchantId, amountCents, description, exp, nonce);
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new BadRequestException('QR invalide — signature incorrecte');
    }

    return { merchantId, amountCents, description, nonce };
  }

  #hmac(merchantId: string, amountCents: number, description: string | undefined, exp: number, nonce: string): string {
    const secret = this.config.get<string>('QR_SIGNING_SECRET') ?? DEV_FALLBACK_SECRET;
    // Champs joints par un séparateur non ambigu (le description est borné à 200 chars côté sign/verify).
    const canonical = `1|${merchantId}|${amountCents}|${description ?? ''}|${exp}|${nonce}`;
    return createHmac('sha256', secret).update(canonical).digest('hex');
  }
}
