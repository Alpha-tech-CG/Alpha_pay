import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { normalizePhone } from '@paybrain/shared';
import { createMtnConnector, createAirtelConnector } from '@paybrain/connectors';
import { CashInDto, CashOutDto, CheckoutWalletPayDto, CreateQrDto, P2PDto, PayQrDto } from './dto/wallet.dto';
import { WalletJwtPayload } from './wallet-jwt.guard';
import { NotificationService } from '../notifications/notification.service';
import { QrSigningService } from './qr-signing.service';
import { WalletAuthService } from './wallet-auth.service';
import { WalletFloatReconciliationService } from './wallet-float-reconciliation.service';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';
import { CurrencyService } from '../currency/currency.service';
import { WalletLimitsService } from './wallet-limits.service';
import { toCents, toMajor } from '../../common/money';

/* ─────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────── */

function fmtAmount(cents: bigint | number): string {
  return (Number(cents) / 100).toLocaleString('fr-CG', { minimumFractionDigits: 0 });
}

function centsString(cents: bigint | number): string {
  return typeof cents === 'bigint' ? cents.toString() : Math.trunc(cents).toString();
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `${phone.slice(0, phone.length - 6)}••••${phone.slice(-2)}` : phone;
}

function resolveConnector(operator: string) {
  if (operator === 'MTN') return createMtnConnector();
  if (operator === 'AIRTEL') return createAirtelConnector();
  throw new BadRequestException(`Opérateur non supporté : ${operator}`);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Champs visés par la violation d'unicité Prisma (meta.target), joints en string. */
function uniqueViolationTarget(err: unknown): string {
  const target = (err as { meta?: { target?: unknown } })?.meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

/* ─────────────────────────────────────────────────
   Service
───────────────────────────────────────────────── */

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly qrSigning: QrSigningService,
    private readonly walletAuth: WalletAuthService,
    private readonly floatReconciliation: WalletFloatReconciliationService,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly currency: CurrencyService,
    private readonly limits: WalletLimitsService,
  ) {}

  /* ── Solde ── */

  async getBalance(actor: WalletJwtPayload) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: actor.sub },
      select: { phone: true, fullName: true, balanceCents: true, currency: true },
    });
    if (!wallet) throw new NotFoundException('Wallet introuvable');
    return {
      phone: wallet.phone,
      fullName: wallet.fullName,
      balanceCents: centsString(wallet.balanceCents),
      currency: wallet.currency,
    };
  }

  /* ── Historique ── */

  async getHistory(actor: WalletJwtPayload, limit = 30) {
    const take = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 30;
    const txs = await this.prisma.walletTransaction.findMany({
      where: { walletId: actor.sub },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true, type: true, amountCents: true, balanceAfter: true,
        status: true, description: true, createdAt: true,
        merchantId: true, peerWallet: { select: { phone: true } },
      },
    });

    return txs.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountCents: centsString(tx.amountCents),
      balanceAfter: centsString(tx.balanceAfter),
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt.toISOString(),
      merchantId: tx.merchantId,
      peerPhone: tx.peerWallet?.phone ?? null,
    }));
  }

  /* ── Cash-In (W2 + W1) ──
     Flux correct :
     1. Vérifier le wallet actif
     2. Créer la tx en PENDING (pas de crédit encore)
     3. Appeler l'opérateur → obtenir referenceId
     4. Stocker operatorRef sur la tx
     5. Le crédit réel arrive via le callback webhook (/v1/wallet/callbacks/:op)
  */
  async cashIn(actor: WalletJwtPayload, dto: CashInDto) {
    const replayed = await this.#findReplay(actor.sub, dto.idempotencyKey);
    if (replayed) return replayed;

    const wallet = await this.#requireActive(actor.sub);

    // Plafond de solde e-money (ALP-174) : refuser un rechargement qui ferait
    // dépasser le solde maximum du niveau KYC.
    await this.limits.assertWithinBalanceCap(wallet.kycLevel, wallet.balanceCents, BigInt(dto.amountCents));

    // Créer la transaction PENDING avant d'appeler l'opérateur
    let pendingTx;
    try {
      pendingTx = await this.prisma.walletTransaction.create({
        data: {
          walletId: actor.sub,
          type: 'CASH_IN',
          amountCents: BigInt(dto.amountCents),
          balanceBefore: wallet.balanceCents,
          balanceAfter: wallet.balanceCents, // sera mis à jour au callback
          status: 'PENDING',
          description: `Rechargement ${dto.operator} — ${dto.phone}`,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.#findReplay(actor.sub, dto.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    // Appel opérateur
    const connector = resolveConnector(dto.operator);
    let referenceId: string;
    try {
      const result = await connector.requestToPay({
        amount: dto.amountCents / 100,   // connecteurs travaillent en unités, pas centimes
        externalId: pendingTx.id,
        phone: dto.phone,
        description: `Rechargement PayBrain`,
        currency: 'XAF',
      });
      referenceId = result.referenceId;
    } catch (err) {
      // Annuler la tx PENDING si l'opérateur rejette immédiatement
      await this.prisma.walletTransaction.update({
        where: { id: pendingTx.id },
        data: { status: 'FAILED' },
      });
      this.logger.error(`CASH_IN opérateur error ${actor.sub}: ${err}`);
      throw new ServiceUnavailableException(`Erreur opérateur ${dto.operator} — réessayez`);
    }

    // Stocker le referenceId opérateur pour retrouver la tx au callback
    await this.prisma.walletTransaction.update({
      where: { id: pendingTx.id },
      data: { operatorRef: referenceId },
    });

    this.logger.log(`CASH_IN PENDING ${actor.sub} +${dto.amountCents} XAF ref=${referenceId}`);
    return { ok: true, txId: pendingTx.id, referenceId, status: 'PENDING', amountCents: centsString(dto.amountCents) };
  }

  /* ── Callback Cash-In (appelé par le webhook opérateur) ── */

  async confirmCashIn(referenceId: string, operatorStatus: 'SUCCESSFUL' | 'FAILED' | 'REJECTED') {
    const tx = await this.prisma.walletTransaction.findFirst({
      where: { operatorRef: referenceId, type: 'CASH_IN', status: 'PENDING' },
      select: { id: true, walletId: true, amountCents: true, balanceBefore: true },
    });

    if (!tx) {
      this.logger.warn(`confirmCashIn: tx introuvable pour ref=${referenceId}`);
      return { ok: true };  // idempotence — déjà traité
    }

    if (operatorStatus !== 'SUCCESSFUL') {
      // CAS : seul le worker qui gagne la transition PENDING → terminal notifie
      const claimed = await this.prisma.walletTransaction.updateMany({
        where: { id: tx.id, status: 'PENDING' },
        data: { status: operatorStatus === 'FAILED' ? 'FAILED' : 'REJECTED' },
      });
      if (claimed.count === 0) return { ok: true };
      this.logger.log(`CASH_IN ${operatorStatus} ref=${referenceId}`);
      // SMS d'échec (fire-and-forget)
      this.prisma.wallet.findUnique({ where: { id: tx.walletId }, select: { phone: true, currency: true } })
        .then((w) => w && this.notifications.send({
          channel: 'SMS', to: w.phone, template: 'wallet.cashin.failed',
          data: { amount: fmtAmount(tx.amountCents), currency: w.currency, operator: '—' },
          category: 'wallet',
        }))
        .catch(() => {});
      return { ok: true };
    }

    // Crédit atomique gardé par CAS sur le statut : un callback rejoué ou
    // concurrent ne peut pas créditer deux fois (double-crédit).
    let balanceAfterCents: bigint = tx.amountCents;
    let walletCurrency = 'XAF';
    let walletPhone = '';
    let credited = false;

    await this.prisma.$transaction(async (prisma) => {
      const claimed = await prisma.walletTransaction.updateMany({
        where: { id: tx.id, status: 'PENDING' },
        data: { status: 'SUCCESSFUL' },
      });
      if (claimed.count === 0) return; // déjà traité par un autre worker

      const updated = await prisma.wallet.update({
        where: { id: tx.walletId },
        data: { balanceCents: { increment: tx.amountCents } },
        select: { balanceCents: true, currency: true, phone: true },
      });
      balanceAfterCents = updated.balanceCents;
      walletCurrency   = updated.currency;
      walletPhone      = updated.phone;
      credited         = true;

      await prisma.walletTransaction.update({
        where: { id: tx.id },
        data: { balanceAfter: updated.balanceCents },   // valeur réelle post-update (W1)
      });
    });

    if (!credited) return { ok: true };

    this.logger.log(`CASH_IN SUCCESSFUL ref=${referenceId} wallet=${tx.walletId}`);

    // SMS de confirmation (fire-and-forget)
    this.notifications.send({
      channel: 'SMS', to: walletPhone, template: 'wallet.cashin.success',
      data: { amount: fmtAmount(tx.amountCents), currency: walletCurrency, balance: fmtAmount(balanceAfterCents) },
      category: 'wallet',
    }).catch(() => {});

    return { ok: true };
  }

  /* ── Génération de QR marchand signé (ALP-172, caissier uniquement) ── */

  async createQr(actor: WalletJwtPayload, dto: CreateQrDto) {
    const cashier = await this.prisma.wallet.findUnique({
      where: { id: actor.sub },
      select: { merchantId: true, status: true },
    });
    if (!cashier || cashier.status !== 'ACTIVE') throw new BadRequestException('Compte caissier inactif');
    if (!cashier.merchantId) {
      throw new BadRequestException('Compte caissier non rattaché à un marchand — contactez le support');
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: cashier.merchantId },
      select: { id: true, isActive: true },
    });
    if (!merchant?.isActive) throw new BadRequestException('Marchand inactif');

    const signed = this.qrSigning.sign({
      merchantId: merchant.id,
      amountCents: dto.amountCents,
      description: dto.description?.trim() || undefined,
    });

    this.logger.log(`QR généré par caissier ${actor.sub} pour merchant:${merchant.id} (${dto.amountCents})`);
    return { ok: true, ...signed };
  }

  /* ── Paiement marchand QR (W1 + W4 + ALP-172) ── */

  async payQr(actor: WalletJwtPayload, dto: PayQrDto) {
    const replayed = await this.#findReplay(actor.sub, dto.idempotencyKey);
    if (replayed) return replayed;

    // Signature HMAC + expiration vérifiées — un QR forgé/expiré est rejeté ici.
    const qr = this.qrSigning.verify(dto.qrPayload);

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: qr.merchantId },
      select: { id: true, isActive: true },
    });
    if (!merchant?.isActive) throw new NotFoundException('Marchand introuvable ou inactif');

    const amountCents = BigInt(qr.amountCents);

    // Plafonds de volume sortant (ALP-174) — pré-contrôle avant débit.
    const payer = await this.#requireActive(actor.sub);
    await this.limits.assertWithinDebitLimits(actor.sub, payer.kycLevel, amountCents);

    // Transaction interactive → débit conditionnel anti-course (W1)
    let tx;
    try {
      tx = await this.prisma.$transaction(async (prisma) => {
        const balanceBefore = await this.#conditionalDebit(prisma, actor.sub, amountCents);

        // qrNonce unique en base : le même QR ne peut être payé qu'une fois (anti-rejeu).
        const walletTx = await prisma.walletTransaction.create({
          data: {
            walletId: actor.sub,
            type: 'PAY',
            amountCents,
            balanceBefore,
            balanceAfter: balanceBefore - amountCents,   // W1
            status: 'SUCCESSFUL',
            merchantId: qr.merchantId,
            description: qr.description ?? 'Paiement marchand',
            idempotencyKey: dto.idempotencyKey ?? null,
            qrNonce: qr.nonce,
          },
        });

        // Conservation de la monnaie : le marchand est crédité via une
        // Transaction (operator=WALLET) qui entre dans le settlement engine
        // existant (commission, reversement, reporting) — sans elle l'argent
        // débité du wallet ne parviendrait jamais au marchand.
        await prisma.transaction.create({
          data: {
            merchantId: qr.merchantId,
            operator: 'WALLET',
            externalId: walletTx.id,
            amount: amountCents,
            currency: 'XAF',
            status: 'SUCCESSFUL',
            payerPhoneMask: maskPhone(actor.phone),
          },
        });

        return walletTx;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        if (uniqueViolationTarget(err).includes('qr_nonce')) {
          throw new BadRequestException('Ce QR a déjà été utilisé — demandez au marchand d\'en générer un nouveau');
        }
        const existing = await this.#findReplay(actor.sub, dto.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    this.logger.log(`PAY ${actor.sub} → merchant:${qr.merchantId} ${qr.amountCents} XAF`);
    return { ok: true, txId: tx.id, amountCents: centsString(qr.amountCents) };
  }

  /* ── Checkout web « Payer avec PayBrain » (ALP-169) ──
     Paiement d'un lien de paiement (paylink) depuis un wallet, sans session :
     phone + PIN vérifiés à la volée (Argon2id anti-timing).
  */
  async payPaylink(paylinkId: string, dto: CheckoutWalletPayDto) {
    const wallet = await this.walletAuth.verifyPin(dto.phone, dto.pin);

    const replayed = await this.#findReplay(wallet.id, dto.idempotencyKey);
    if (replayed) return replayed;

    const link = await this.prisma.paymentLink.findUnique({
      where: { id: paylinkId },
      include: { merchant: { select: { id: true, name: true, isActive: true } } },
    });
    if (!link) throw new NotFoundException('Lien de paiement introuvable');
    if (link.expiresAt && link.expiresAt < new Date()) throw new BadRequestException('Lien de paiement expiré');
    if (!link.merchant.isActive) throw new BadRequestException('Marchand inactif');

    // Multi-devises (ALP-170) : si le lien est libellé dans une autre devise que
    // le wallet (XAF), on convertit — le payeur est débité en XAF, le marchand
    // reste crédité dans la devise du lien (USD/EUR…). Le taux est recalculé ici
    // (autoritatif), jamais fourni par le client.
    const charge = await this.#resolveWalletCharge(link.amount, link.currency, wallet.currency);
    const walletDebitCents = charge.walletDebitCents;
    const merchantAmountCents = link.amount; // devise du lien, inchangée

    // Plafonds de volume sortant (ALP-174) — sur le montant réellement débité (XAF).
    await this.limits.assertWithinDebitLimits(wallet.id, wallet.kycLevel, walletDebitCents);

    let tx;
    try {
      tx = await this.prisma.$transaction(async (prisma) => {
        // Claim CAS du lien : un seul payeur peut le régler (double-scan simultané exclu).
        const claimed = await prisma.paymentLink.updateMany({
          where: { id: link.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count === 0) throw new BadRequestException('Ce lien de paiement a déjà été utilisé');

        const balanceBefore = await this.#conditionalDebit(prisma, wallet.id, walletDebitCents);

        const walletTx = await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'PAY',
            amountCents: walletDebitCents,   // ce qui quitte le wallet, en devise wallet
            balanceBefore,
            balanceAfter: balanceBefore - walletDebitCents,
            status: 'SUCCESSFUL',
            merchantId: link.merchant.id,
            description: link.description ?? `Paiement ${link.merchant.name}`,
            idempotencyKey: dto.idempotencyKey ?? null,
            ...(charge.fx ? { metadata: { fx: charge.fx } } : {}),
          },
        });

        // externalId unique par marchand → un paylink ne peut être réglé qu'une fois,
        // même en course avec le flux Mobile Money (défense en profondeur avec le claim CAS).
        // Le marchand est crédité dans la devise du lien → le settlement engine (ALP-151)
        // gère le reversement/FX vers sa devise de settlement.
        await prisma.transaction.create({
          data: {
            merchantId: link.merchant.id,
            operator: 'WALLET',
            externalId: `paylink-${link.id}`,
            amount: merchantAmountCents,
            currency: link.currency,
            status: 'SUCCESSFUL',
            payerPhoneMask: maskPhone(wallet.phone),
            payerMessage: link.description,
          },
        });

        return walletTx;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const target = uniqueViolationTarget(err);
        if (target.includes('external')) {
          throw new BadRequestException('Ce lien de paiement a déjà été réglé');
        }
        const existing = await this.#findReplay(wallet.id, dto.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    this.logger.log(
      `CHECKOUT wallet ${wallet.id} → merchant:${link.merchant.id} paylink:${link.id} ` +
      `(${merchantAmountCents} ${link.currency}${charge.fx ? ` = ${walletDebitCents} ${wallet.currency} @${charge.fx.rate}` : ''})`,
    );

    // Webhook marchand — même contrat que les paiements Mobile Money (ALP-132).
    // amount/currency = ce que le marchand encaisse (devise du lien).
    this.webhookDelivery.dispatch(link.merchant.id, 'payment.succeeded', {
      type: 'payment.succeeded',
      externalId: `paylink-${link.id}`,
      referenceId: tx.id,
      status: 'SUCCESSFUL',
      amount: Number(merchantAmountCents),
      currency: link.currency,
      method: 'WALLET',
    }).catch((err) => this.logger.error(`Dispatch webhook checkout échoué: ${err?.message}`));

    return {
      ok: true,
      txId: tx.id,
      amountCents: centsString(walletDebitCents),   // débité au payeur, en devise wallet
      currency: wallet.currency,
      merchantAmountCents: centsString(merchantAmountCents),
      merchantCurrency: link.currency,
      merchantName: link.merchant.name,
      ...(charge.fx ? { fxRate: charge.fx.rate } : {}),
    };
  }

  /**
   * Calcule le montant à débiter du wallet pour régler un lien, en convertissant
   * si le lien n'est pas dans la devise du wallet. Retourne les centimes wallet
   * à débiter + les détails FX (audités sur la transaction).
   */
  async #resolveWalletCharge(
    linkAmountCents: bigint,
    linkCurrency: string,
    walletCurrency: string,
  ): Promise<{ walletDebitCents: bigint; fx: { originalAmountCents: string; originalCurrency: string; rate: number; walletCurrency: string } | null }> {
    if (linkCurrency === walletCurrency) {
      return { walletDebitCents: linkAmountCents, fx: null };
    }
    const linkMajor = toMajor(linkAmountCents);
    // Lève une 404 claire si aucun taux n'est configuré pour ce couple.
    const quote = await this.currency.convert(linkMajor, linkCurrency, walletCurrency);
    return {
      walletDebitCents: toCents(quote.convertedAmount),
      fx: {
        originalAmountCents: centsString(linkAmountCents),
        originalCurrency: linkCurrency,
        rate: quote.rate,
        walletCurrency,
      },
    };
  }

  /* ── Cash-Out — retrait vers Mobile Money (W2 + W1) ──
     Flux :
     1. Vérifier solde suffisant (débit conditionnel atomique)
     2. Débiter le wallet atomiquement (solde réservé)
     3. Appeler le disbursement opérateur
     4. Si l'opérateur échoue immédiatement → rembourser + FAILED
     5. Confirmation finale via callback opérateur
  */
  async cashOut(actor: WalletJwtPayload, dto: CashOutDto) {
    const replayed = await this.#findReplay(actor.sub, dto.idempotencyKey);
    if (replayed) return replayed;

    // Garde-fou insolvabilité (ALP-175) : gèle les retraits si la dernière
    // réconciliation a détecté une dérive de float critique.
    await this.floatReconciliation.assertFloatHealthy();

    const amountCents = BigInt(dto.amountCents);

    // Plafonds de volume sortant (ALP-174).
    const payer = await this.#requireActive(actor.sub);
    await this.limits.assertWithinDebitLimits(actor.sub, payer.kycLevel, amountCents);

    // Débit préventif conditionnel + enregistrement PENDING en transaction atomique (W1)
    let tx;
    try {
      tx = await this.prisma.$transaction(async (prisma) => {
        const balanceBefore = await this.#conditionalDebit(prisma, actor.sub, amountCents);

        return prisma.walletTransaction.create({
          data: {
            walletId: actor.sub,
            type: 'CASH_OUT',
            amountCents,
            balanceBefore,
            balanceAfter: balanceBefore - amountCents,   // W1
            status: 'PENDING',
            description: `Retrait ${dto.operator} → ${dto.phone}`,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.#findReplay(actor.sub, dto.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    // Appel disbursement opérateur
    const connector = resolveConnector(dto.operator);
    let referenceId: string;
    try {
      const result = await connector.disburse({
        amount: dto.amountCents / 100,
        externalId: tx.id,
        phone: dto.phone,
        currency: 'XAF',
      });
      referenceId = result.referenceId;
    } catch (err) {
      // Échec immédiat → remboursement atomique + FAILED (W2), gardé par CAS
      await this.prisma.$transaction(async (prisma) => {
        const claimed = await prisma.walletTransaction.updateMany({
          where: { id: tx.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
        if (claimed.count === 0) return;
        const refunded = await prisma.wallet.update({
          where: { id: actor.sub },
          data: { balanceCents: { increment: amountCents } },
          select: { balanceCents: true },
        });
        await prisma.walletTransaction.update({
          where: { id: tx.id },
          data: { balanceAfter: refunded.balanceCents },
        });
      });
      this.logger.error(`CASH_OUT opérateur error ${actor.sub}: ${err}`);
      throw new ServiceUnavailableException(`Erreur opérateur ${dto.operator} — votre solde a été restitué`);
    }

    await this.prisma.walletTransaction.update({
      where: { id: tx.id },
      data: { operatorRef: referenceId },
    });

    this.logger.log(`CASH_OUT PENDING ${actor.sub} -${dto.amountCents} XAF ref=${referenceId}`);
    return { ok: true, txId: tx.id, referenceId, status: 'PENDING', amountCents: centsString(dto.amountCents) };
  }

  /* ── Callback Cash-Out (confirmation disbursement) ── */

  async confirmCashOut(referenceId: string, operatorStatus: 'SUCCESSFUL' | 'FAILED' | 'REJECTED') {
    const tx = await this.prisma.walletTransaction.findFirst({
      where: { operatorRef: referenceId, type: 'CASH_OUT', status: 'PENDING' },
      select: { id: true, walletId: true, amountCents: true },
    });

    if (!tx) {
      this.logger.warn(`confirmCashOut: tx introuvable pour ref=${referenceId}`);
      return { ok: true };
    }

    if (operatorStatus === 'SUCCESSFUL') {
      const claimed = await this.prisma.walletTransaction.updateMany({
        where: { id: tx.id, status: 'PENDING' },
        data: { status: 'SUCCESSFUL' },
      });
      if (claimed.count === 0) return { ok: true };
      this.logger.log(`CASH_OUT SUCCESSFUL ref=${referenceId}`);

      // SMS de confirmation retrait (fire-and-forget)
      this.prisma.wallet.findUnique({
        where: { id: tx.walletId },
        select: { phone: true, currency: true, balanceCents: true },
      }).then((w) => w && this.notifications.send({
        channel: 'SMS', to: w.phone, template: 'wallet.cashout.success',
        data: {
          amount: fmtAmount(tx.amountCents),
          currency: w.currency,
          balance: fmtAmount(w.balanceCents),
          operator: '—',
          phone: w.phone,
        },
        category: 'wallet',
      })).catch(() => {});
    } else {
      // Disbursement échoué → rembourser le wallet (W2).
      // La tx CASH_OUT garde son type (piste d'audit) et passe FAILED/REJECTED ;
      // le remboursement est matérialisé par une tx REFUND distincte.
      let refundedPhone = '';
      let refundedCurrency = 'XAF';
      let refunded = false;
      await this.prisma.$transaction(async (prisma) => {
        const claimed = await prisma.walletTransaction.updateMany({
          where: { id: tx.id, status: 'PENDING' },
          data: { status: operatorStatus === 'FAILED' ? 'FAILED' : 'REJECTED' },
        });
        if (claimed.count === 0) return; // déjà traité

        const wallet = await prisma.wallet.update({
          where: { id: tx.walletId },
          data: { balanceCents: { increment: tx.amountCents } },
          select: { balanceCents: true, phone: true, currency: true },
        });
        refundedPhone    = wallet.phone;
        refundedCurrency = wallet.currency;
        refunded         = true;

        await prisma.walletTransaction.create({
          data: {
            walletId: tx.walletId,
            type: 'REFUND',
            amountCents: tx.amountCents,
            balanceBefore: wallet.balanceCents - tx.amountCents,
            balanceAfter: wallet.balanceCents,
            status: 'SUCCESSFUL',
            description: `Remboursement retrait échoué (${referenceId})`,
          },
        });
      });
      if (!refunded) return { ok: true };
      this.logger.warn(`CASH_OUT ${operatorStatus} → REFUND ref=${referenceId} wallet=${tx.walletId}`);

      // SMS d'échec retrait (fire-and-forget)
      this.notifications.send({
        channel: 'SMS', to: refundedPhone, template: 'wallet.cashout.failed',
        data: { amount: fmtAmount(tx.amountCents), currency: refundedCurrency },
        category: 'wallet',
      }).catch(() => {});
    }

    return { ok: true };
  }

  /* ── P2P (W1) ── */

  async p2p(actor: WalletJwtPayload, dto: P2PDto) {
    const replayed = await this.#findReplay(actor.sub, dto.idempotencyKey);
    if (replayed) return replayed;

    const toPhone = normalizePhone(dto.toPhone);

    const receiverWallet = await this.prisma.wallet.findUnique({
      where: { phone: toPhone },
      select: { id: true, phone: true, balanceCents: true, status: true, kycLevel: true },
    });
    if (!receiverWallet) throw new NotFoundException(`Aucun compte trouvé pour ${toPhone}`);
    if (receiverWallet.status !== 'ACTIVE') throw new BadRequestException('Destinataire inactif');
    if (receiverWallet.id === actor.sub) throw new BadRequestException('Impossible de s\'envoyer à soi-même');

    const amountCents = BigInt(dto.amountCents);
    const desc = dto.description ?? `Transfert vers ${toPhone}`;

    // Plafonds e-money (ALP-174) : volume sortant émetteur + plafond de solde destinataire.
    const sender = await this.#requireActive(actor.sub);
    await this.limits.assertWithinDebitLimits(actor.sub, sender.kycLevel, amountCents);
    await this.limits.assertWithinBalanceCap(receiverWallet.kycLevel, receiverWallet.balanceCents, amountCents);

    // Transaction interactive — débit conditionnel anti-course (W1)
    let result;
    try {
      result = await this.prisma.$transaction(async (prisma) => {
        const senderBalanceBefore = await this.#conditionalDebit(prisma, actor.sub, amountCents);

        const receiverUpdated = await prisma.wallet.update({
          where: { id: receiverWallet.id },
          data: { balanceCents: { increment: amountCents } },
          select: { balanceCents: true, currency: true },
        });

        const sendTx = await prisma.walletTransaction.create({
          data: {
            walletId: actor.sub,
            type: 'P2P_SEND',
            amountCents,
            balanceBefore: senderBalanceBefore,
            balanceAfter: senderBalanceBefore - amountCents,   // W1
            status: 'SUCCESSFUL',
            peerWalletId: receiverWallet.id,
            description: desc,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });
        await prisma.walletTransaction.create({
          data: {
            walletId: receiverWallet.id,
            type: 'P2P_RECEIVE',
            amountCents,
            balanceBefore: receiverUpdated.balanceCents - amountCents,
            balanceAfter: receiverUpdated.balanceCents,  // W1
            status: 'SUCCESSFUL',
            peerWalletId: actor.sub,
            description: `Reçu de ${actor.phone}`,
          },
        });

        return { sendTx, receiverBalanceAfter: receiverUpdated.balanceCents, receiverCurrency: receiverUpdated.currency };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.#findReplay(actor.sub, dto.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    this.logger.log(`P2P ${actor.sub} → ${receiverWallet.id} ${dto.amountCents} XAF`);

    // SMS au destinataire (fire-and-forget)
    this.notifications.send({
      channel: 'SMS', to: receiverWallet.phone, template: 'wallet.p2p.received',
      data: {
        amount: fmtAmount(amountCents),
        currency: result.receiverCurrency,
        balance: fmtAmount(result.receiverBalanceAfter),
        from: actor.phone,
      },
      category: 'wallet',
    }).catch(() => {});

    return { ok: true, txId: result.sendTx.id, amountCents: centsString(dto.amountCents), toPhone };
  }

  /* ── Privé ── */

  /**
   * Débite `amountCents` seulement si le wallet est ACTIF et le solde suffisant,
   * en une seule requête conditionnelle (aucune fenêtre entre lecture et écriture).
   * Retourne le solde AVANT débit. Lève une erreur métier précise sinon.
   */
  async #conditionalDebit(
    prisma: Pick<PrismaClient, 'wallet'>,
    walletId: string,
    amountCents: bigint,
  ): Promise<bigint> {
    const debited = await prisma.wallet.updateMany({
      where: { id: walletId, status: 'ACTIVE', balanceCents: { gte: amountCents } },
      data: { balanceCents: { decrement: amountCents } },
    });

    if (debited.count === 0) {
      // Diagnostic précis pour l'utilisateur (hors du chemin critique)
      const wallet = await prisma.wallet.findUnique({
        where: { id: walletId },
        select: { status: true },
      });
      if (!wallet) throw new NotFoundException('Wallet introuvable');
      if (wallet.status !== 'ACTIVE') throw new BadRequestException('Compte suspendu');
      throw new BadRequestException('Solde insuffisant');
    }

    const after = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { balanceCents: true },
    });
    return after.balanceCents + amountCents;
  }

  /** Rejeu idempotent : renvoie la réponse de la transaction d'origine si la clé a déjà servi. */
  async #findReplay(walletId: string, idempotencyKey?: string) {
    if (!idempotencyKey) return null;
    const existing = await this.prisma.walletTransaction.findUnique({
      where: { walletId_idempotencyKey: { walletId, idempotencyKey } },
      select: { id: true, amountCents: true, status: true, operatorRef: true },
    });
    if (!existing) return null;
    return {
      ok: true,
      txId: existing.id,
      amountCents: centsString(existing.amountCents),
      status: existing.status,
      ...(existing.operatorRef ? { referenceId: existing.operatorRef } : {}),
      idempotentReplay: true,
    };
  }

  async #requireActive(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, balanceCents: true, status: true, kycLevel: true },
    });
    if (!wallet) throw new NotFoundException('Wallet introuvable');
    if (wallet.status !== 'ACTIVE') throw new BadRequestException('Compte suspendu');
    return wallet;
  }
}
