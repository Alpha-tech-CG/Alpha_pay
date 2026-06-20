import { Injectable } from "@nestjs/common";
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
  async send(request: PayoutRequest): Promise<PayoutResult> {
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
