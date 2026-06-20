import { Inject, Injectable, Logger } from "@nestjs/common";
import { NotificationChannel, PrismaClient } from "@paybrain/database";
import { createHash, randomUUID } from "crypto";
import { sendEmail, sendSms, SendResult } from "./providers";
import { renderTemplate } from "./templates";

export interface SendParams {
  channel: NotificationChannel;
  to: string;
  template: string;
  data?: Record<string, unknown>;
  category: string;
  /** Si fourni, les préférences opt-out du marchand sont respectées. */
  merchantId?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  /** Envoie, journalise et retente une fois les erreurs transitoires. */
  async send(params: SendParams) {
    const { channel, to, template, category, merchantId } = params;

    if (merchantId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: {
          merchantId_category_channel: { merchantId, category, channel },
        },
      });
      if (pref?.optedOut) {
        await this.log(
          channel,
          to,
          template,
          "v0",
          category,
          "SKIPPED",
          "opt-out marchand",
        );
        return { ok: false, skipped: true };
      }
    }

    const rendered = renderTemplate(template, params.data ?? {});
    let result: SendResult = { ok: false, error: "canal non supporté" };
    let attempts = 1;

    if (channel === "SMS" || channel === "EMAIL") {
      ({ result, attempts } = await this.dispatchWithRetry(
        channel,
        to,
        rendered,
      ));
    } else if (channel === "WEBHOOK") {
      // L'envoi webhook est assuré par WebhookDeliveryService (ALP-132).
      result = await this.enqueueWebhook(
        merchantId,
        category,
        template,
        params.data ?? {},
      );
    }

    await this.log(
      channel,
      to,
      template,
      rendered.version,
      category,
      result.ok ? "SENT" : "FAILED",
      result.error ?? null,
      result.provider,
      result.providerMessageId,
      attempts,
    );
    return {
      ok: result.ok,
      stubbed: result.stubbed,
      providerMessageId: result.providerMessageId,
    };
  }

  /** Applique un callback fournisseur de manière idempotente. */
  async markDelivery(
    provider: string,
    providerMessageId: string,
    delivered: boolean,
    error?: string,
  ) {
    const result = await this.prisma.notificationLog.updateMany({
      where: { provider, providerMessageId },
      data: {
        status: delivered ? "DELIVERED" : "FAILED",
        deliveredAt: delivered ? new Date() : null,
        error: delivered ? null : (error ?? "delivery_failed"),
      },
    });
    return { ok: result.count > 0, matched: result.count };
  }

  private async enqueueWebhook(
    merchantId: string | undefined,
    category: string,
    template: string,
    data: Record<string, unknown>,
  ): Promise<SendResult> {
    if (!merchantId)
      return { ok: false, error: "merchantId requis pour WEBHOOK" };

    const event = `notification.${category}`;
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId, status: "ACTIVE", events: { has: event } },
    });
    if (endpoints.length === 0)
      return { ok: false, error: "aucun endpoint abonne" };

    for (const endpoint of endpoints) {
      await this.prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event,
          webhookId: randomUUID(),
          payload: { type: event, template, data } as any,
        },
      });
    }
    return { ok: true };
  }

  private async dispatchWithRetry(
    channel: "SMS" | "EMAIL",
    to: string,
    rendered: ReturnType<typeof renderTemplate>,
  ): Promise<{ result: SendResult; attempts: number }> {
    const send = channel === "SMS" ? sendSms : sendEmail;
    const first = await send(to, rendered);
    if (first.ok || !first.retryable) return { result: first, attempts: 1 };

    this.logger.warn(
      `Notification ${channel} en échec (${first.error}), retry…`,
    );
    return { result: await send(to, rendered), attempts: 2 };
  }

  private log(
    channel: NotificationChannel,
    recipient: string,
    template: string,
    templateVersion: string,
    category: string,
    status: "SENT" | "FAILED" | "SKIPPED",
    error: string | null,
    provider?: string,
    providerMessageId?: string,
    attempts = 1,
  ) {
    return this.prisma.notificationLog
      .create({
        data: {
          channel,
          recipient: createHash("sha256").update(recipient).digest("hex"),
          template,
          templateVersion,
          category,
          status,
          provider,
          providerMessageId,
          attempts,
          error: error ?? undefined,
        },
      })
      .catch(() => undefined);
  }
}
