import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaClient, SettlementStatus } from "@paybrain/database";
import { LedgerService } from "../ledger/ledger.service";
import { NotificationService } from "../notifications/notification.service";
import { WebhookDeliveryService } from "../webhooks-out/webhook-delivery.service";
import { toCents, toMajor } from "../../common/money";
import { decryptField, encryptField } from "../../common/security/pii-crypto";
import { PayoutProviderService } from "./payout-provider.service";
import { SettlementReceiptService } from "./settlement-receipt.service";
import { CurrencyService } from "../currency/currency.service";
import { safeEqual } from "../../common/security/hmac";

// Seuil au-delà duquel la double validation (4-eyes) est requise.
const DOUBLE_VALIDATION_THRESHOLD_CENTS = 500_000n * 100n; // 500 000 FCFA

/**
 * Liste des validateurs autorisés et de leur secret propre, depuis
 * SETTLEMENT_VALIDATORS ("alice:secretA,bob:secretB"). Chaque validateur
 * présente SON secret : un détenteur du token interne partagé ne peut plus
 * inventer deux noms distincts pour contourner le 4-eyes (ALP-VULN).
 */
function authorizedValidators(): Map<string, string> {
  const raw = process.env.SETTLEMENT_VALIDATORS ?? "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const idx = pair.indexOf(":");
    if (idx > 0) map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return map;
}

function encryptDestination(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(encryptField(value));
}

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationService,
    private readonly webhooks: WebhookDeliveryService,
    private readonly payout: PayoutProviderService,
    private readonly receipts: SettlementReceiptService,
    private readonly currency: CurrencyService,
  ) {}

  async getConfig(merchantId: string) {
    const config = await this.prisma.merchantSettlementConfig.findUnique({
      where: { merchantId },
    });
    return (
      config ?? {
        merchantId,
        frequency: "T1",
        minAmountCents: 0n,
        commissionBps: 150,
        dayOfWeek: null,
        enabled: true,
        payoutMethod: "MOMO" as const,
        payoutProvider: null,
        payoutDestinationEncrypted: null,
        settlementCurrency: null,
      }
    );
  }

  async upsertConfig(
    merchantId: string,
    data: {
      frequency?: any;
      minAmountCents?: number;
      commissionBps?: number;
      dayOfWeek?: number;
      enabled?: boolean;
      payoutMethod?: "BANK" | "MOMO";
      payoutProvider?: string;
      payoutDestination?: string;
      settlementCurrency?: string;
    },
  ) {
    return this.prisma.merchantSettlementConfig.upsert({
      where: { merchantId },
      update: {
        ...(data.settlementCurrency
          ? { settlementCurrency: data.settlementCurrency }
          : {}),
        ...(data.frequency ? { frequency: data.frequency } : {}),
        ...(data.minAmountCents != null
          ? { minAmountCents: BigInt(data.minAmountCents) }
          : {}),
        ...(data.commissionBps != null
          ? { commissionBps: data.commissionBps }
          : {}),
        ...(data.dayOfWeek != null ? { dayOfWeek: data.dayOfWeek } : {}),
        ...(data.enabled != null ? { enabled: data.enabled } : {}),
        ...(data.payoutMethod ? { payoutMethod: data.payoutMethod } : {}),
        ...(data.payoutProvider ? { payoutProvider: data.payoutProvider } : {}),
        ...(data.payoutDestination
          ? {
              payoutDestinationEncrypted: encryptDestination(
                data.payoutDestination,
              ),
            }
          : {}),
      },
      create: {
        merchantId,
        frequency: data.frequency ?? "T1",
        minAmountCents: BigInt(data.minAmountCents ?? 0),
        commissionBps: data.commissionBps ?? 150,
        dayOfWeek: data.dayOfWeek ?? null,
        enabled: data.enabled ?? true,
        payoutMethod: data.payoutMethod ?? "MOMO",
        payoutProvider: data.payoutProvider ?? null,
        payoutDestinationEncrypted: data.payoutDestination
          ? encryptDestination(data.payoutDestination)
          : null,
        settlementCurrency: data.settlementCurrency ?? null,
      },
    });
  }

  /**
   * Calcule le solde net (encaissements − commission − retenues) d'un marchand
   * sur une période et crée un batch de reversement si le seuil minimum est
   * atteint. Trace l'écriture comptable (débit wallet marchand → crédit transit).
   */
  async run(merchantId: string, periodStart: Date, periodEnd: Date) {
    const config = await this.getConfig(merchantId);

    const txns = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        status: "SUCCESSFUL",
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      select: { amount: true, currency: true },
    });
    if (txns.length === 0)
      return { created: false, reason: "aucun encaissement sur la période" };

    const currency = txns[0].currency;
    const grossCents = txns.reduce((s, t) => s + t.amount, 0n);
    const commissionCents =
      (grossCents * BigInt(config.commissionBps)) / 10000n;
    const holdsCents = 0n;
    const netCents = grossCents - commissionCents - holdsCents;

    if (netCents < BigInt(config.minAmountCents)) {
      return {
        created: false,
        reason: `net ${netCents} < seuil minimum ${config.minAmountCents}`,
      };
    }

    // FX (ALP-151) : si le marchand veut être reversé dans une autre devise que
    // celle encaissée, on convertit le net et on conserve taux + montant converti.
    let settlementCurrency: string | null = null;
    let settledNetCents: bigint | null = null;
    let fxRate: number | null = null;
    if (config.settlementCurrency && config.settlementCurrency !== currency) {
      const quote = await this.currency.convert(toMajor(netCents), currency, config.settlementCurrency);
      settlementCurrency = config.settlementCurrency;
      settledNetCents = toCents(quote.convertedAmount);
      fxRate = quote.rate;
    }

    const requiresDoubleValidation =
      netCents > DOUBLE_VALIDATION_THRESHOLD_CENTS;
    const status: SettlementStatus = requiresDoubleValidation
      ? "PENDING_VALIDATION"
      : "INITIATED";
    const batchNumber = `STL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex")}`;

    const batch = await this.prisma.settlementBatch.create({
      data: {
        batchNumber,
        merchantId,
        periodStart,
        periodEnd,
        currency,
        grossCents,
        commissionCents,
        holdsCents,
        netCents,
        settlementCurrency,
        settledNetCents,
        fxRate,
        status,
        requiresDoubleValidation,
        audits: {
          create: {
            action: "CREATED",
            actor: "system",
            details: `net ${netCents} centimes`,
          },
        },
      },
    });

    const receiptPdfKey = await this.receipts.archive({
      batchNumber,
      merchantId,
      periodStart,
      periodEnd,
      currency,
      grossCents,
      commissionCents,
      holdsCents,
      netCents,
    });
    if (receiptPdfKey) {
      await this.prisma.settlementBatch.update({
        where: { id: batch.id },
        data: { receiptPdfKey },
      });
    }

    // Traçabilité comptable : débit wallet marchand → crédit compte de transit.
    await this.ledger.postEntry([
      {
        accountId: `merchant-wallet-${merchantId}`,
        direction: "DEBIT",
        amountCents: netCents,
        currency,
        description: `settlement ${batchNumber}`,
      },
      {
        accountId: "settlement-transit",
        direction: "CREDIT",
        amountCents: netCents,
        currency,
        description: `settlement ${batchNumber}`,
      },
    ]);

    // Conversion FX éventuelle : déplace le transit de la devise encaissée vers
    // la devise de reversement (jambes équilibrées par devise via fx-exchange).
    if (settlementCurrency && settledNetCents != null) {
      await this.ledger.postConversion({
        fromAccount: "settlement-transit",
        toAccount: `settlement-transit-${settlementCurrency}`,
        amountFromCents: netCents,
        currencyFrom: currency,
        amountToCents: settledNetCents,
        currencyTo: settlementCurrency,
        description: `FX settlement ${batchNumber}`,
      });
    }

    this.logger.log(
      `Batch ${batchNumber} créé (${status}) net ${netCents} centimes pour ${merchantId}`,
    );
    return {
      created: true,
      batchId: batch.id,
      batchNumber,
      status,
      netCents: netCents.toString(),
      currency,
      settlementCurrency,
      settledNetCents: settledNetCents != null ? settledNetCents.toString() : null,
      fxRate,
      requiresDoubleValidation,
    };
  }

  /**
   * Authentifie un validateur contre SETTLEMENT_VALIDATORS (secret propre,
   * comparaison à temps constant). En production, la liste est obligatoire ;
   * en dev/test sans configuration, on n'impose pas l'authentification (le
   * filtrage reste assuré par l'InternalGuard en amont).
   */
  private assertAuthorizedValidator(validatorId: string, token: string | undefined) {
    const validators = authorizedValidators();
    if (validators.size === 0) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("SETTLEMENT_VALIDATORS requis en production (4-eyes)");
      }
      return; // dev/test : pas de liste configurée
    }
    const secret = validators.get(validatorId);
    if (!secret || !safeEqual(Buffer.from(token ?? ""), Buffer.from(secret))) {
      throw new ForbiddenException("Validateur non autorisé");
    }
  }

  /** Double validation (4-eyes) : 2 validateurs distincts requis si seuil dépassé. */
  async validate(batchId: string, validatorId: string, validatorToken?: string) {
    this.assertAuthorizedValidator(validatorId, validatorToken);
    const batch = await this.requireBatch(batchId);
    if (batch.status !== "PENDING_VALIDATION") {
      throw new BadRequestException(
        `Batch non en attente de validation (statut ${batch.status})`,
      );
    }
    if (batch.validatedBy.includes(validatorId)) {
      throw new ForbiddenException(
        "Validateur déjà enregistré — il faut un second validateur distinct",
      );
    }
    const validatedBy = [...batch.validatedBy, validatorId];
    const enough =
      validatedBy.length >= (batch.requiresDoubleValidation ? 2 : 1);
    const nextStatus: SettlementStatus = enough
      ? "INITIATED"
      : "PENDING_VALIDATION";

    // CAS atomique (ALP-VULN #6) : l'UPDATE ne s'applique que si la version, le
    // statut et l'absence de ce validateur tiennent TOUJOURS au moment de
    // l'écriture. Deux requêtes concurrentes ne peuvent pas pousser le même
    // validateur ni dépasser le compte attendu — la perdante tombe en 409.
    const updated = await this.prisma.settlementBatch.updateMany({
      where: {
        id: batchId,
        version: batch.version,
        status: "PENDING_VALIDATION",
        NOT: { validatedBy: { has: validatorId } },
      },
      data: {
        validatedBy,
        status: nextStatus,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(
        "Validation concurrente détectée — réessayez",
      );
    }
    await this.prisma.settlementAudit.create({
      data: { batchId, action: "VALIDATED", actor: validatorId },
    });
    return {
      id: batchId,
      status: nextStatus,
      validators: validatedBy.length,
    };
  }

  /** Émet l'ordre de paiement externe avec une clé d'idempotence stable. */
  async send(batchId: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status !== "INITIATED")
      throw new BadRequestException(
        `Batch non prêt à l'envoi (statut ${batch.status})`,
      );

    const config = await this.getConfig(batch.merchantId);
    if (!config.payoutDestinationEncrypted) {
      throw new BadRequestException(
        "Destination de reversement marchand non configurée",
      );
    }

    // Reversement dans la devise/montant convertis si le marchand a une devise
    // de settlement distincte ; sinon la devise/montant encaissés.
    const payoutAmountCents = batch.settledNetCents ?? batch.netCents;
    const payoutCurrency = batch.settlementCurrency ?? batch.currency;

    let payoutResult;
    try {
      payoutResult = await this.payout.send({
        batchNumber: batch.batchNumber,
        amountCents: payoutAmountCents,
        currency: payoutCurrency,
        method: config.payoutMethod,
        provider: config.payoutProvider ?? config.payoutMethod.toLowerCase(),
        destination: decryptField(config.payoutDestinationEncrypted),
      });
    } catch (error: any) {
      const reason = error?.message ?? "échec payout externe";
      await this.prisma.settlementBatch.update({
        where: { id: batchId },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: reason,
          audits: {
            create: { action: "FAILED", actor: "system", details: reason },
          },
        },
      });
      throw new BadRequestException("Échec du décaissement externe");
    }

    // Écriture : débit transit → crédit compte de paiement externe.
    await this.ledger.postEntry([
      {
        accountId: "settlement-transit",
        direction: "DEBIT",
        amountCents: batch.netCents,
        currency: batch.currency,
        description: `payout ${batch.batchNumber}`,
      },
      {
        accountId: "payout-external",
        direction: "CREDIT",
        amountCents: batch.netCents,
        currency: batch.currency,
        description: `payout ${batch.batchNumber}`,
      },
    ]);

    await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        payoutProvider: payoutResult.provider,
        externalReference: payoutResult.externalReference,
        audits: {
          create: {
            action: "SENT",
            actor: "system",
            details: `provider ${payoutResult.provider}, ref ${payoutResult.externalReference}`,
          },
        },
      },
    });
    return {
      id: batchId,
      status: "SENT",
      externalReference: payoutResult.externalReference,
    };
  }

  /** Confirme le settlement et notifie le marchand (email + webhook). */
  async confirm(batchId: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status !== "SENT")
      throw new BadRequestException(
        `Batch non envoyé (statut ${batch.status})`,
      );

    await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        audits: { create: { action: "CONFIRMED", actor: "system" } },
      },
    });

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: batch.merchantId },
      select: { emailEncrypted: true },
    });
    const data = {
      batchNumber: batch.batchNumber,
      amount: toMajor(batch.netCents),
      currency: batch.currency,
    };
    if (merchant?.emailEncrypted) {
      await this.notifications.send({
        channel: "EMAIL",
        to: decryptField(merchant.emailEncrypted),
        template: "payment.succeeded",
        category: "settlement",
        merchantId: batch.merchantId,
        data: {
          externalId: batch.batchNumber,
          amount: data.amount,
          currency: data.currency,
        },
      });
    }
    await this.webhooks.dispatch(batch.merchantId, "payment.succeeded", {
      type: "settlement.confirmed",
      ...data,
    });

    return { id: batchId, status: "CONFIRMED" };
  }

  listBatches() {
    return this.prisma.settlementBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** Reversements d'UN marchand (vue marchand, scopée). */
  listForMerchant(merchantId: string, limit = 50) {
    return this.prisma.settlementBatch.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
  }

  /** Config de settlement d'un marchand sans la destination chiffrée (vue marchand). */
  async getConfigForMerchant(merchantId: string) {
    const config = await this.getConfig(merchantId);
    const { payoutDestinationEncrypted, ...rest } = config as Record<string, unknown>;
    return { ...rest, hasPayoutDestination: payoutDestinationEncrypted != null };
  }

  async getBatch(id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
      include: { audits: true },
    });
    if (!batch) throw new NotFoundException("Batch introuvable");
    return batch;
  }

  private async requireBatch(id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
    });
    if (!batch) throw new NotFoundException("Batch introuvable");
    return batch;
  }
}
