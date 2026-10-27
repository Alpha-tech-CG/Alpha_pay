import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PaymentLink, Prisma, PrismaClient } from '@paybrain/database';
import { AuditService } from '../../common/audit/audit.service';
import { checkoutUrl, newPublicCode } from '../../common/codes/public-code';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount, toMinor } from '../../common/money';
import { afterCursor, decodeCursor, page } from '../../common/pagination/cursor';
import { MessagingService } from '../messaging/messaging.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService, operatorHints } from '../checkout/checkout.service';
import { MobileMoneyOperator } from '../providers/mobile-money.registry';

export interface CreateLinkInput {
  /** Unités majeures ; absent = montant libre (§M4). */
  amount?: number;
  currency: string;
  description: string;
  expiresAt?: Date;
  multiUse?: boolean;
}

/** Qui agit : un membre (tableau de bord) ou une clé API. */
export interface LinkActor {
  type: 'user' | 'api_key';
  id: string;
  ip?: string;
}

export type LinkState = 'actif' | 'expiré' | 'utilisé' | 'désactivé';

/** Montant plafond d'un paiement (aligné sur CreatePaymentDto). */
const AMOUNT_MAX = 5_000_000;

/**
 * Liens de paiement (T-52, §M4) : montant fixe ou libre, expiration, usage
 * unique ou multiple, partage WhatsApp/SMS. Un lien expiré, désactivé ou déjà
 * payé n'initie JAMAIS de paiement.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly payments: PaymentsService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  static checkoutUrl(code: string): string {
    return checkoutUrl('l', code);
  }

  async create(merchantId: string, livemode: boolean, input: CreateLinkInput, actor: LinkActor) {
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', "La date d'expiration doit être dans le futur", 'expires_at');
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const link = await this.prisma.paymentLink.create({
          data: {
            merchantId,
            livemode,
            amount: input.amount != null ? toMinor(input.amount, input.currency) : null,
            currency: input.currency,
            description: input.description.trim(),
            expiresAt: input.expiresAt,
            multiUse: input.multiUse ?? false,
            publicCode: newPublicCode(),
          },
        });
        await this.record(actor, merchantId, 'paylinks.link_created', link.id, { livemode });
        return this.present(link, 0);
      } catch (err) {
        // Collision de code public (rarissime) : on retire un code.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 3) continue;
        throw err;
      }
    }
  }

  async get(merchantId: string, livemode: boolean, id: string) {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, merchantId, livemode } });
    if (!link) throw new ApiError(HttpStatus.NOT_FOUND, 'lien_introuvable', 'Lien de paiement introuvable', 'id');
    return this.present(link, await this.paidCount(link));
  }

  async list(merchantId: string, livemode: boolean, limit: number, startingAfter?: string) {
    const rows = await this.prisma.paymentLink.findMany({
      where: { merchantId, livemode, ...afterCursor(decodeCursor(startingAfter)) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const counts = await this.prisma.transaction.groupBy({
      by: ['paymentLinkId'],
      where: { paymentLinkId: { in: rows.map((r) => r.id) }, livemode, status: 'SUCCEEDED' },
      _count: { _all: true },
    });
    const paid = new Map(counts.map((c) => [c.paymentLinkId, c._count._all]));
    return page(rows, limit, (l) => this.present(l, paid.get(l.id) ?? 0));
  }

  async deactivate(merchantId: string, livemode: boolean, id: string, actor: LinkActor) {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, merchantId, livemode } });
    if (!link) throw new ApiError(HttpStatus.NOT_FOUND, 'lien_introuvable', 'Lien de paiement introuvable', 'id');
    const updated = link.active ? await this.prisma.paymentLink.update({ where: { id }, data: { active: false } }) : link;
    if (link.active) {
      await this.record(actor, merchantId, 'paylinks.link_deactivated', id);
    }
    return this.present(updated, await this.paidCount(link));
  }

  /** Envoie le lien par WhatsApp (bascule SMS) ou SMS au numéro donné (§M4 « partage en un clic »). */
  async send(merchantId: string, livemode: boolean, id: string, phone: string, channel: 'whatsapp' | 'sms') {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, merchantId, livemode }, include: { merchant: { select: { name: true } } } });
    if (!link) throw new ApiError(HttpStatus.NOT_FOUND, 'lien_introuvable', 'Lien de paiement introuvable', 'id');
    const state = this.stateOf(link, await this.paidCount(link));
    if (state !== 'actif') throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'lien_inactif', `Ce lien est ${state}`);
    return this.messaging.send({
      merchantId,
      livemode,
      channels: channel === 'whatsapp' ? ['WHATSAPP', 'SMS'] : ['SMS'],
      to: { phone },
      templateKey: 'lien.paiement',
      variables: {
        merchantName: link.merchant.name,
        description: link.description,
        amount: link.amount != null ? formatAmount(link.amount, link.currency) : 'montant libre',
        link: PaymentLinksService.checkoutUrl(link.publicCode!),
      },
      category: 'TRANSACTIONAL',
    });
  }

  // ─── Page hébergée (publique, sans compte) ───────────────────────────────

  /** Ce que la page hébergée affiche ; un lien non payable renvoie son état, pas d'erreur. */
  async publicView(code: string) {
    const link = await this.findByCode(code);
    const state = this.stateOf(link, await this.paidCount(link));
    return {
      object: 'payment_link',
      code,
      merchant_name: link.merchant.name,
      description: link.description,
      amount: link.amount != null ? toMajorAmount(link.amount, link.currency) : null,
      currency: link.currency,
      livemode: link.livemode,
      state,
      message: STATE_MESSAGES[state],
      operators: operatorHints(),
    };
  }

  /** Paiement depuis la page hébergée. Refuse tout lien non actif, sans appel opérateur. */
  async pay(code: string, input: { phone: string; amount?: number; operator?: MobileMoneyOperator }) {
    const link = await this.findByCode(code);
    const state = this.stateOf(link, await this.paidCount(link));
    if (state !== 'actif') throw new ApiError(HttpStatus.GONE, STATE_CODES[state], STATE_MESSAGES[state]);

    if (!link.multiUse) {
      const pending = await this.prisma.transaction.count({ where: { paymentLinkId: link.id, livemode: link.livemode, status: 'PENDING' } });
      if (pending > 0) throw new ApiError(HttpStatus.CONFLICT, 'paiement_en_cours', 'Un paiement est déjà en cours sur ce lien');
    }

    let amount: number;
    if (link.amount != null) {
      amount = toMajorAmount(link.amount, link.currency);
    } else {
      if (!Number.isInteger(input.amount) || input.amount! < 1 || input.amount! > AMOUNT_MAX) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', `amount : entier entre 1 et ${AMOUNT_MAX}`, 'amount');
      }
      amount = input.amount!;
    }

    const tx = await this.payments.initiatePayment(
      {
        amount,
        currency: link.currency,
        phone: input.phone,
        operator: input.operator,
        description: link.description,
        reference: `lien-${link.publicCode}-${newPublicCode(10)}`,
        paymentLinkId: link.id,
      },
      link.merchantId,
      link.livemode,
    );
    return CheckoutService.started(tx);
  }

  // ─── Interne ─────────────────────────────────────────────────────────────

  private record(actor: LinkActor, merchantId: string, action: string, targetId: string, metadata?: Record<string, unknown>) {
    return this.audit.record({ actorType: actor.type, actorId: actor.id, merchantId, action, targetType: 'payment_link', targetId, ip: actor.ip, metadata });
  }

  private async findByCode(code: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { publicCode: code }, include: { merchant: { select: { name: true } } } });
    if (!link) throw new ApiError(HttpStatus.NOT_FOUND, 'lien_introuvable', 'Ce lien de paiement n’existe pas');
    return link;
  }

  private paidCount(link: { id: string; livemode: boolean }) {
    return this.prisma.transaction.count({ where: { paymentLinkId: link.id, livemode: link.livemode, status: 'SUCCEEDED' } });
  }

  stateOf(link: PaymentLink, paidCount: number): LinkState {
    if (!link.active) return 'désactivé';
    if (!link.multiUse && (link.usedAt || paidCount > 0)) return 'utilisé';
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return 'expiré';
    return 'actif';
  }

  present(link: PaymentLink, paidCount: number) {
    const url = PaymentLinksService.checkoutUrl(link.publicCode!);
    const amountText = link.amount != null ? formatAmount(link.amount, link.currency) : null;
    const shareText = `${link.description}${amountText ? ` (${amountText})` : ''} : payez par Mobile Money ici ${url}`;
    return {
      id: link.id,
      object: 'payment_link',
      livemode: link.livemode,
      url,
      code: link.publicCode,
      amount: link.amount != null ? toMajorAmount(link.amount, link.currency) : null,
      currency: link.currency,
      description: link.description,
      multi_use: link.multiUse,
      state: this.stateOf(link, paidCount),
      payments_succeeded: paidCount,
      expires_at: link.expiresAt,
      created_at: link.createdAt,
      share: {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        sms: `sms:?&body=${encodeURIComponent(shareText)}`,
      },
    };
  }
}

const STATE_MESSAGES: Record<LinkState, string> = {
  actif: 'Ce lien est valable.',
  expiré: 'Ce lien de paiement a expiré. Demandez un nouveau lien au marchand.',
  utilisé: 'Ce lien de paiement a déjà été payé.',
  désactivé: 'Ce lien de paiement a été désactivé par le marchand.',
};

const STATE_CODES: Record<Exclude<LinkState, 'actif'>, string> = {
  expiré: 'lien_expire',
  utilisé: 'lien_deja_utilise',
  désactivé: 'lien_desactive',
};
