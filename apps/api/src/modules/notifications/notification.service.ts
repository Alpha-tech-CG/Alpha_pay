import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, PrismaClient } from '@paybrain/database';
import { renderTemplate } from './templates';
import { sendEmail, sendSms, SendResult } from './providers';

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

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /**
   * Envoie une notification multi-canal (ALP-143). Respecte l'opt-out marchand
   * par (catégorie, canal), rend le template versionné, dispatche au provider,
   * journalise le résultat. Un retry sur échec transitoire.
   */
  async send(params: SendParams) {
    const { channel, to, template, category, merchantId } = params;
    const data = params.data ?? {};

    // Préférences : opt-out marchand.
    if (merchantId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { merchantId_category_channel: { merchantId, category, channel } },
      });
      if (pref?.optedOut) {
        await this.log(channel, to, template, 'v0', category, 'SKIPPED', 'opt-out marchand');
        return { ok: false, skipped: true };
      }
    }

    const rendered = renderTemplate(template, data);

    let result: SendResult = { ok: false, error: 'canal non supporté' };
    if (channel === 'SMS' || channel === 'EMAIL') {
      result = await this.dispatchWithRetry(channel, to, rendered);
    } else if (channel === 'WEBHOOK') {
      // Le canal webhook marchand est géré par le système de webhooks sortants
      // (ALP-132) ; ici on journalise seulement la demande.
      result = { ok: true, stubbed: true };
    }

    await this.log(channel, to, template, rendered.version, category, result.ok ? 'SENT' : 'FAILED', result.error ?? null);
    return { ok: result.ok, stubbed: result.stubbed };
  }

  private async dispatchWithRetry(channel: 'SMS' | 'EMAIL', to: string, rendered: ReturnType<typeof renderTemplate>): Promise<SendResult> {
    const fn = channel === 'SMS' ? sendSms : sendEmail;
    const first = await fn(to, rendered);
    if (first.ok) return first;
    // Retry unique sur échec transitoire (timeout / erreur réseau / 5xx).
    this.logger.warn(`Notification ${channel} -> ${to} échec (${first.error}), retry…`);
    return fn(to, rendered);
  }

  private log(
    channel: NotificationChannel,
    recipient: string,
    template: string,
    templateVersion: string,
    category: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    error: string | null,
  ) {
    return this.prisma.notificationLog
      .create({ data: { channel, recipient, template, templateVersion, category, status, error: error ?? undefined } })
      .catch(() => undefined);
  }
}
