import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import {
  CURRENCIES,
  SUPPORTED_CURRENCIES,
  currencyDecimals,
  formatMoney,
  isSupportedCurrency,
  isValidMajorAmount,
} from '@paybrain/shared';
import { LedgerService } from '../ledger/ledger.service';
import { toCents } from '../../common/money';

export interface ConversionQuote {
  from: string;
  to: string;
  rate: number;
  amount: number;
  convertedAmount: number;
  formatted: string;
}

@Injectable()
export class CurrencyService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly ledger: LedgerService,
  ) {}

  listCurrencies() {
    return SUPPORTED_CURRENCIES.map((code) => CURRENCIES[code]);
  }

  listRates() {
    return this.prisma.currencyRate.findMany({ orderBy: [{ base: 'asc' }, { quote: 'asc' }] });
  }

  private assertSupported(...codes: string[]) {
    for (const c of codes) {
      if (!isSupportedCurrency(c)) {
        throw new BadRequestException(`Devise non supportée : ${c}. Supportées : ${SUPPORTED_CURRENCIES.join(', ')}`);
      }
    }
  }

  async upsertRate(base: string, quote: string, rate: number) {
    this.assertSupported(base, quote);
    if (base === quote) throw new BadRequestException('base et quote doivent différer');
    if (!Number.isFinite(rate) || rate <= 0) throw new BadRequestException('rate doit être un nombre positif');
    return this.prisma.currencyRate.upsert({
      where: { base_quote: { base, quote } },
      update: { rate, source: 'manual' },
      create: { base, quote, rate, source: 'manual' },
    });
  }

  /** Taux 1 `from` = X `to`. Cherche le taux direct, sinon l'inverse, sinon 404. */
  async getRate(from: string, to: string): Promise<number> {
    this.assertSupported(from, to);
    if (from === to) return 1;

    const direct = await this.prisma.currencyRate.findUnique({ where: { base_quote: { base: from, quote: to } } });
    if (direct) return Number(direct.rate);

    const inverse = await this.prisma.currencyRate.findUnique({ where: { base_quote: { base: to, quote: from } } });
    if (inverse && Number(inverse.rate) > 0) return 1 / Number(inverse.rate);

    throw new NotFoundException(`Aucun taux de change configuré pour ${from} → ${to}`);
  }

  /** Convertit un montant (unité majeure) de `from` vers `to`, arrondi à la précision de `to`. */
  async convert(amount: number, from: string, to: string): Promise<ConversionQuote> {
    this.assertSupported(from, to);
    if (!isValidMajorAmount(amount, from)) {
      throw new BadRequestException(`Montant invalide pour ${from} (précision : ${currencyDecimals(from)} décimale(s))`);
    }
    const rate = await this.getRate(from, to);
    const factor = 10 ** currencyDecimals(to);
    const convertedAmount = Math.round(amount * rate * factor) / factor;
    return {
      from,
      to,
      rate,
      amount,
      convertedAmount,
      formatted: formatMoney(convertedAmount, to),
    };
  }

  /**
   * Convertit ET enregistre l'opération au grand livre (ALP-151) : déplace le
   * solde du wallet marchand de la devise source vers la devise cible, via deux
   * jambes équilibrées par devise (comptes `merchant-wallet-<id>-<DEV>`).
   */
  async convertAndRecord(merchantId: string, amount: number, from: string, to: string) {
    const quote = await this.convert(amount, from, to);
    const ledgerTransactionId = await this.ledger.postConversion({
      fromAccount: `merchant-wallet-${merchantId}-${from}`,
      toAccount: `merchant-wallet-${merchantId}-${to}`,
      amountFromCents: toCents(quote.amount),
      currencyFrom: from,
      amountToCents: toCents(quote.convertedAmount),
      currencyTo: to,
      description: `FX ${from}->${to} @ ${quote.rate}`,
    });
    return { ...quote, ledgerTransactionId };
  }
}
