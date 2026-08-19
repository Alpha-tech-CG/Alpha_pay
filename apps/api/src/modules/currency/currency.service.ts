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
import { toCents, toMajor } from '../../common/money';

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

  /**
   * Enregistre l'exposition de change d'un paiement wallet cross-devises
   * (ALP-170 / AVANT_PROD §0.5) : le payeur est débité en devise wallet, le
   * marchand crédité dans la devise du lien — la plateforme porte le risque FX.
   * On pose la conversion en deux jambes via les comptes `fx-exchange-*` pour
   * qu'elle apparaisse dans `fxSpread()`. Comptes de contrepartie dédiés
   * (`wallet-fx-*`) pour ne pas mélanger avec le settlement marchand.
   * Renvoie l'id de transaction ledger, ou null si l'écriture échoue (best-effort
   * — appelé hors du chemin critique de paiement).
   */
  async recordWalletFxExposure(params: {
    walletDebitCents: bigint;
    walletCurrency: string;
    merchantAmountCents: bigint;
    merchantCurrency: string;
    rate: number;
    reference: string;
  }): Promise<string | null> {
    if (params.walletCurrency === params.merchantCurrency) return null;
    return this.ledger.postConversion({
      fromAccount: `wallet-fx-payer-${params.walletCurrency}`,
      toAccount: `wallet-fx-merchant-${params.merchantCurrency}`,
      amountFromCents: params.walletDebitCents,
      currencyFrom: params.walletCurrency,
      amountToCents: params.merchantAmountCents,
      currencyTo: params.merchantCurrency,
      description: `Wallet FX ${params.walletCurrency}->${params.merchantCurrency} @${params.rate} (${params.reference})`,
    });
  }

  /**
   * Écart de change (ALP-151) : valorise le solde net des comptes d'échange
   * `fx-exchange-<DEV>` dans une devise de référence. Un net non nul = le gain/
   * perte de change accumulé (marge appliquée + résidus d'arrondi). Reporting.
   */
  async fxSpread(base = 'XAF') {
    this.assertSupported(base);
    const baseFactor = 10 ** currencyDecimals(base);
    const round = (n: number) => Math.round(n * baseFactor) / baseFactor;

    const lines: Array<{ currency: string; balance: number; valueInBase: number }> = [];
    let netSpread = 0;
    for (const currency of SUPPORTED_CURRENCIES) {
      const balanceCents = await this.ledger.getAccountBalance(`fx-exchange-${currency}`);
      if (balanceCents === 0n) continue;
      const balance = toMajor(balanceCents);
      const valueInBase = currency === base ? balance : balance * (await this.getRate(currency, base));
      const rounded = round(valueInBase);
      lines.push({ currency, balance, valueInBase: rounded });
      netSpread += rounded;
    }
    netSpread = round(netSpread);
    return { base, lines, netSpread, formatted: formatMoney(netSpread, base) };
  }
}
