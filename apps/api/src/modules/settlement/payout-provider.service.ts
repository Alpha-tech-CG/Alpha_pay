import { Injectable } from "@nestjs/common";
import { createMtnConnector, createAirtelConnector } from "@paybrain/connectors";
import { detectOperator } from "@paybrain/shared";
import { toMajor } from "../../common/money";

export interface PayoutRequest {
  batchNumber: string;
  amountCents: bigint;
  currency: string;
  method: "BANK" | "MOMO";
  provider: string;
  destination: string;
}

export interface PayoutResult {
  externalReference: string;
  provider: string;
  status: "ACCEPTED" | "PENDING";
}

@Injectable()
export class PayoutProviderService {
  private readonly mtn = createMtnConnector();
  private readonly airtel = createAirtelConnector();

  async send(request: PayoutRequest): Promise<PayoutResult> {
    // Reversement Mobile Money : on route vers le Disbursement de l'opérateur
    // déduit du numéro destinataire. Le virement bancaire (BANK) passe par le
    // fournisseur générique ci-dessous.
    if (request.method === "MOMO") {
      return this.sendMomo(request);
    }
    return this.sendBank(request);
  }

  private async sendMomo(request: PayoutRequest): Promise<PayoutResult> {
    const operator = detectOperator(request.destination);
    const connector = operator === "MTN" ? this.mtn : this.airtel;
    const result = await connector.disburse({
      amount: toMajor(request.amountCents),
      currency: request.currency,
      phone: request.destination,
      externalId: request.batchNumber,
      description: `Reversement ${request.batchNumber}`,
    });
    return {
      externalReference: result.referenceId,
      provider: operator,
      status: result.status === "SUCCESSFUL" ? "ACCEPTED" : "PENDING",
    };
  }

  private async sendBank(request: PayoutRequest): Promise<PayoutResult> {
    const baseUrl = process.env.PAYOUT_API_URL;
    const token = process.env.PAYOUT_API_TOKEN;
    if (!baseUrl || !token) {
      throw new Error("PAYOUT_API_URL/PAYOUT_API_TOKEN non configurés");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": request.batchNumber,
      },
      body: JSON.stringify({
        externalId: request.batchNumber,
        amount: toMajor(request.amountCents),
        currency: request.currency,
        method: request.method,
        provider: request.provider,
        destination: request.destination,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new Error(
        `Payout HTTP ${response.status}: ${String(payload.message ?? "échec fournisseur")}`,
      );
    }
    const externalReference =
      payload.id ?? payload.reference ?? payload.externalReference;
    if (typeof externalReference !== "string" || !externalReference) {
      throw new Error("Référence fournisseur absente de la réponse payout");
    }
    return {
      externalReference,
      provider: request.provider,
      status:
        String(payload.status ?? "").toUpperCase() === "PENDING"
          ? "PENDING"
          : "ACCEPTED",
    };
  }
}
