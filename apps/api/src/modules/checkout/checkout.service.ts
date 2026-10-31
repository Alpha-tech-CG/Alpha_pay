import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ANY_MODE, PrismaClient } from '@paybrain/database';
import { operatorConfig, publicPaymentStatus } from '@paybrain/shared';
import { newPublicCode } from '../../common/codes/public-code';
import { ApiError } from '../../common/errors/api-error';
import { toMajorAmount } from '../../common/money';
import { PaymentsService } from '../payments/payments.service';
import { checkoutToken, isValidCheckoutToken, publicDocumentUrl } from '../providers/callback-token';
import { MobileMoneyOperator } from '../providers/mobile-money.registry';

const AMOUNT_MAX = 5_000_000;

/** Préfixes opérateur pour préremplir le choix sur la page (§M4) ; la configuration fait foi. */
export function operatorHints() {
  const config = operatorConfig();
  return { country_code: config.countryCode, national_length: config.nationalNumberLength, prefixes: config.prefixes };
}

const STATUS_MESSAGES: Record<string, string> = {
  en_attente: 'Validez le paiement sur votre téléphone (code secret Mobile Money).',
  réussi: 'Paiement réussi. Merci !',
  échoué: "Le paiement n'a pas abouti. Vous pouvez réessayer.",
  expiré: "Le paiement n'a pas été validé à temps. Vous pouvez réessayer.",
  annulé: 'Le paiement a été annulé.',
};

/**
 * Page de paiement hébergée (T-53) : paiement à une caisse depuis son QR, et
 * suivi du statut par le navigateur qui a lancé le paiement (jeton signé).
 */
@Injectable()
export class CheckoutService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Mode d'une caisse : live dès que le KYB du marchand est approuvé, test
   * sinon (le marchand essaie son QR avec l'opérateur factice) — D-047.
   */
  private async tillContext(code: string) {
    const till = await this.prisma.till.findUnique({
      where: { publicCode: code },
      include: { store: { select: { name: true, active: true, merchant: { select: { name: true, onboardingStatus: true, isActive: true } } } } },
    });
    if (!till) throw new ApiError(HttpStatus.NOT_FOUND, 'caisse_introuvable', 'Ce QR code ne correspond à aucune caisse');
    const merchant = till.store.merchant;
    const active = till.active && till.store.active && merchant.isActive;
    return { till, merchant, active, livemode: merchant.onboardingStatus === 'APPROVED' };
  }

  async tillView(code: string) {
    const { till, merchant, active, livemode } = await this.tillContext(code);
    return {
      object: 'till',
      code,
      merchant_name: merchant.name,
      store_name: till.store.name,
      till_name: till.name,
      livemode,
      state: active ? 'actif' : 'désactivé',
      message: active ? null : "Cette caisse n'accepte plus de paiements. Adressez-vous au vendeur.",
      operators: operatorHints(),
    };
  }

  async payTill(code: string, input: { phone: string; amount: number; operator?: MobileMoneyOperator }) {
    const { till, active, livemode } = await this.tillContext(code);
    if (!active) throw new ApiError(HttpStatus.GONE, 'caisse_desactivee', "Cette caisse n'accepte plus de paiements.");
    if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > AMOUNT_MAX) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', `amount : entier entre 1 et ${AMOUNT_MAX}`, 'amount');
    }
    const tx = await this.payments.initiatePayment(
      {
        amount: input.amount,
        currency: 'XAF',
        phone: input.phone,
        operator: input.operator,
        description: `${till.store.name} - ${till.name}`,
        reference: `caisse-${code}-${newPublicCode(10)}`,
        tillId: till.id,
      },
      till.merchantId,
      livemode,
    );
    return CheckoutService.started(tx);
  }

  /** Réponse commune après lancement : de quoi suivre le statut, rien de plus. */
  static started(tx: { id: string; status: any }) {
    return { id: tx.id, status: publicPaymentStatus(tx.status), client_token: checkoutToken(tx.id) };
  }

  async status(id: string, token: unknown) {
    if (!isValidCheckoutToken(id, token)) throw new ApiError(HttpStatus.NOT_FOUND, 'paiement_introuvable', 'Paiement introuvable');
    // Lecture par id seul : le jeton signé tient lieu de droit d'accès (mode quelconque).
    const tx = await this.prisma.transaction.findFirst({
      where: { id, livemode: ANY_MODE },
      include: { merchant: { select: { name: true } } },
    });
    if (!tx) throw new ApiError(HttpStatus.NOT_FOUND, 'paiement_introuvable', 'Paiement introuvable');
    const status = publicPaymentStatus(tx.status);
    const receipt = tx.status === 'SUCCEEDED' ? await this.prisma.receipt.findUnique({ where: { transactionId: tx.id }, select: { id: true } }) : null;
    return {
      id: tx.id,
      status,
      final: tx.status !== 'PENDING',
      amount: toMajorAmount(tx.amount, tx.currency),
      currency: tx.currency,
      operator: tx.operator.toLowerCase(),
      merchant_name: tx.merchant.name,
      message: STATUS_MESSAGES[status],
      // Reçu PDF du payeur (§M7), par lien signé, dès qu'il est émis.
      receipt_url: receipt ? publicDocumentUrl('receipt', receipt.id) : null,
    };
  }
}
