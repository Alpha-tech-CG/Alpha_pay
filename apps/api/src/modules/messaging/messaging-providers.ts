import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import {
  EmailProvider,
  InfobipSmsProvider,
  MetaWhatsAppProvider,
  MockEmailProvider,
  MockOutbox,
  MockSentMessage,
  MockSmsProvider,
  MockWhatsAppProvider,
  SmsProvider,
  SmtpEmailProvider,
  WhatsAppProvider,
} from '@paybrain/providers';
import { KvStore } from '../../common/kv/kv-store';

export const DEV_OUTBOX_KEY = 'dev-outbox';

/** La boîte d'envoi de dev n'existe jamais en production. */
export function devOutboxEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_OUTBOX_ENABLED !== 'false';
}

/**
 * Fournisseurs de messages choisis par la configuration (factices par défaut,
 * §2.7) : SMS_PROVIDER=mock|infobip, WHATSAPP_PROVIDER=mock|meta,
 * EMAIL_PROVIDER=mock|smtp.
 */
@Injectable()
export class MessagingProviders {
  private readonly logger = new Logger(MessagingProviders.name);
  readonly outbox = new MockOutbox();
  readonly sms: SmsProvider;
  readonly whatsapp: WhatsAppProvider;
  readonly email: EmailProvider;

  constructor(kv: KvStore) {
    // En dev, ce qu'auraient envoyé les fournisseurs factices est consultable
    // via GET /dev/outbox (contient des codes OTP : jamais en production).
    if (devOutboxEnabled()) {
      this.outbox.onRecord = (m: MockSentMessage) => {
        void kv
          .pushCapped(DEV_OUTBOX_KEY, JSON.stringify({ ...m, at: new Date().toISOString() }), 100, 3600)
          .catch(() => undefined);
      };
    }
    this.sms = this.createSms();
    this.whatsapp = this.createWhatsApp();
    this.email = this.createEmail();
    const mocks = [this.sms, this.whatsapp, this.email].filter((p) => p.name.startsWith('mock')).map((p) => p.name);
    if (mocks.length && process.env.NODE_ENV === 'production') {
      this.logger.warn(`Fournisseurs de messages factices en production : ${mocks.join(', ')}`);
    }
  }

  /** URL d'accusé, authentifiée par un jeton secret (Infobip ne signe pas ses accusés). */
  private notifyUrl(path: string): string | undefined {
    const base = process.env.PUBLIC_API_URL;
    const token = process.env.MESSAGING_WEBHOOK_TOKEN;
    return base && token ? `${base.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}` : undefined;
  }

  private createSms(): SmsProvider {
    if (process.env.SMS_PROVIDER === 'infobip') {
      return new InfobipSmsProvider({
        baseUrl: process.env.INFOBIP_BASE_URL ?? '',
        apiKey: process.env.INFOBIP_API_KEY ?? '',
        senderId: process.env.SMS_SENDER_ID ?? 'AlphaPay',
        notifyUrl: this.notifyUrl('/webhooks/messages/infobip'),
      });
    }
    return new MockSmsProvider(this.outbox);
  }

  private createWhatsApp(): WhatsAppProvider {
    if (process.env.WHATSAPP_PROVIDER === 'meta') {
      return new MetaWhatsAppProvider({
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
        appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
        apiVersion: process.env.WHATSAPP_API_VERSION || undefined,
      });
    }
    return new MockWhatsAppProvider(this.outbox);
  }

  private createEmail(): EmailProvider {
    if (process.env.EMAIL_PROVIDER === 'smtp') {
      return new SmtpEmailProvider(createTransport(process.env.SMTP_URL ?? 'smtp://localhost:1025'), process.env.EMAIL_FROM ?? '');
    }
    return new MockEmailProvider(this.outbox);
  }

  /** Fournisseur par nom (accusés de livraison). */
  byName(name: string): SmsProvider | WhatsAppProvider | EmailProvider | undefined {
    return [this.sms, this.whatsapp, this.email].find((p) => p.name === name);
  }
}
