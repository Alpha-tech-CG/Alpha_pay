import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { PaymentsService } from '../payments/payments.service';
import { QrSigningService } from '../wallet/qr-signing.service';
import { CurrencyService } from '../currency/currency.service';
import { CreatePaylinkDto } from './dto/create-paylink.dto';
import { toCents, toMajor } from '../../common/money';

const DEFAULT_QR_TTL_SECONDS = 24 * 3600;
// Devise des wallets clients en V1 (ALP-170). Le checkout affiche l'équivalent.
const WALLET_CURRENCY = 'XAF';

@Injectable()
export class PaylinksService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly paymentsService: PaymentsService,
    private readonly qrSigning: QrSigningService,
    private readonly currency: CurrencyService,
  ) {}

  /** Code numérique court (8 chiffres) composable sur un téléphone à touches via USSD. */
  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = String(randomInt(10_000_000, 100_000_000)); // 8 chiffres
      const exists = await this.prisma.paymentLink.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new Error('Impossible de générer un code de paiement unique');
  }

  async create(dto: CreatePaylinkDto, merchantId: string) {
    const expiresAt = dto.expiresInMinutes
      ? new Date(Date.now() + dto.expiresInMinutes * 60 * 1000)
      : null;

    const code = await this.generateUniqueCode();
    const link = await this.prisma.paymentLink.create({
      data: { merchantId, amount: toCents(dto.amount), currency: dto.currency, description: dto.description, code, expiresAt },
    });

    const baseUrl = process.env.CHECKOUT_URL ?? 'http://localhost:5174';
    const ussdShortcode = process.env.USSD_SHORTCODE ?? '*182#';

    // Payload signé HMAC (ALP-172) — seul format accepté par le scanner wallet.
    // TTL aligné sur l'expiration du lien (défaut 24 h).
    const ttlSeconds = dto.expiresInMinutes ? dto.expiresInMinutes * 60 : DEFAULT_QR_TTL_SECONDS;
    const { qrPayload } = this.qrSigning.sign(
      {
        merchantId,
        amountCents: Number(toCents(dto.amount)),
        description: dto.description,
      },
      ttlSeconds,
    );

    return {
      id: link.id,
      url: `${baseUrl}/pay/${link.id}`,
      code,
      ussd: `${ussdShortcode} puis code ${code}`,
      expiresAt,
      qrPayload,
    };
  }

  async findById(id: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { id },
      include: { merchant: { select: { name: true } } },
    });

    if (!link) throw new NotFoundException('Lien introuvable');
    if (link.expiresAt && link.expiresAt < new Date()) throw new BadRequestException('Lien expiré');

    // Devis wallet (ALP-170) : équivalent XAF que paierait un wallet client si le
    // lien est en devise étrangère. Purement indicatif — recalculé au paiement.
    const walletQuote = await this.#walletQuote(toMajor(link.amount), link.currency);

    return { ...link, amount: toMajor(link.amount), walletQuote };
  }

  /** Équivalent en devise wallet (XAF) d'un montant en devise étrangère, ou null. */
  async #walletQuote(amountMajor: number, currency: string) {
    if (currency === WALLET_CURRENCY) return null;
    try {
      const quote = await this.currency.convert(amountMajor, currency, WALLET_CURRENCY);
      return {
        currency: WALLET_CURRENCY,
        amount: quote.convertedAmount,
        rate: quote.rate,
        formatted: quote.formatted,
      };
    } catch {
      // Aucun taux configuré → le checkout affichera seulement la devise du lien.
      return null;
    }
  }

  async pay(id: string, phone: string) {
    const link = await this.findById(id);
    if (link.usedAt) throw new BadRequestException('Ce lien de paiement a déjà été utilisé');

    const result = await this.paymentsService.initiatePayment(
      {
        // findById renvoie déjà le montant en unités majeures.
        amount: link.amount,
        currency: link.currency,
        phone,
        externalId: `paylink-${link.id}`,
        description: link.description,
      },
      link.merchantId,
    );

    await this.prisma.paymentLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });

    return result;
  }
}
