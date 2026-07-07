import {
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
import { LoginWalletDto, RegisterWalletDto } from './dto/wallet.dto';

const FALLBACK_SECRET = 'dev-secret-change-in-prod';

@Injectable()
export class WalletAuthService implements OnModuleInit {
  private readonly logger = new Logger(WalletAuthService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  async register(dto: RegisterWalletDto) {
    const phone = dto.phone.replace(/\s/g, '');

    const existing = await this.prisma.wallet.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('Ce numéro est déjà enregistré');

    const pinHash = await argon2.hash(dto.pin, { type: argon2.argon2id });

    const wallet = await this.prisma.wallet.create({
      data: { phone, fullName: dto.fullName, pinHash, currency: 'XAF' },
      select: { id: true, phone: true, fullName: true, role: true },
    });

    this.logger.log(`Nouveau wallet créé : ${wallet.id} (${phone})`);
    return { ok: true, phone: wallet.phone };
  }

  /**
   * Vérifie phone + PIN (anti-timing) et renvoie le wallet ACTIF.
   * Utilisé par le login ET par le checkout web (paiement sans session).
   */
  async verifyPin(rawPhone: string, pin: string) {
    const phone = rawPhone.replace(/\s/g, '');

    const wallet = await this.prisma.wallet.findUnique({ where: { phone } });

    // Vérification contre un hash factice si le wallet n'existe pas (anti-timing)
    if (!wallet) {
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        pin,
      ).catch(() => {});
      throw new UnauthorizedException('Numéro ou PIN incorrect');
    }

    if (wallet.status !== 'ACTIVE') {
      throw new UnauthorizedException('Ce compte est suspendu');
    }

    const valid = await argon2.verify(wallet.pinHash, pin).catch(() => false);
    if (!valid) throw new UnauthorizedException('Numéro ou PIN incorrect');

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
}
