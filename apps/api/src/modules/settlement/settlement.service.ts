import {
  BadRequestException,
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
import { toMajor } from "../../common/money";
import { decryptField, encryptField } from "../../common/security/pii-crypto";
import { PayoutProviderService } from "./payout-provider.service";
import { SettlementReceiptService } from "./settlement-receipt.service";
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
    },
  ) {
    return this.prisma.merchantSettlementConfig.upsert({
      where: { merchantId },
      update: {
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

    this.logger.log(
      `Batch ${batchNumber} créé (${status}) net ${netCents} centimes pour ${merchantId}`,
    );
    return {
      created: true,
      batchId: batch.id,
      batchNumber,
      status,
      netCents: netCents.toString(),
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

    const updated = await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: {
        validatedBy,
        status: enough ? "INITIATED" : "PENDING_VALIDATION",
        audits: { create: { action: "VALIDATED", actor: validatorId } },
      },
    });
    return {
      id: batchId,
      status: updated.status,
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

    let payoutResult;
    try {
      payoutResult = await this.payout.send({
        batchNumber: batch.batchNumber,
        amountCents: batch.netCents,
        currency: batch.currency,
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
