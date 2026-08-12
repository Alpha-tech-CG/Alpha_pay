import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NotificationConnector {
  sendSms(to: string, message: string): Promise<{ id: string }>;
  sendEmail(to: string, subject: string, body: string): Promise<{ id: string }>;
}
export const NOTIFICATION_CONNECTOR = 'NOTIFICATION_CONNECTOR';

/** STUB — journalise au lieu d'envoyer. Utilisé tant que NOTIFY_USE_STUB=true. */
@Injectable()
export class NotificationConnectorStub implements NotificationConnector {
  private readonly logger = new Logger(NotificationConnectorStub.name);
  async sendSms(to: string, message: string): Promise<{ id: string }> {
    this.logger.warn(`[STUB] SMS -> ${to} : ${message}`);
    return { id: `stub-sms-${Date.now()}` };
  }
  async sendEmail(to: string, subject: string, body: string): Promise<{ id: string }> {
    this.logger.warn(`[STUB] EMAIL -> ${to} : ${subject}`);
    return { id: `stub-email-${Date.now()}` };
  }
}

/** REAL — SMS via Africa's Talking, email via SendGrid. Prêt : ne manque que les clés. */
@Injectable()
export class NotificationConnectorReal implements NotificationConnector {
  private readonly logger = new Logger(NotificationConnectorReal.name);
  constructor(private readonly config: ConfigService) {}

  async sendSms(to: string, message: string): Promise<{ id: string }> {
    const key = this.config.get<string>('AT_API_KEY');
    const username = this.config.get<string>('AT_USERNAME');
    if (!key || !username) throw new Error('NOTIFY_USE_STUB=false mais AT_API_KEY/AT_USERNAME manquants (SMS)');
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey: key, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ username, to, message, from: this.config.get<string>('SMS_SENDER_ID') ?? 'AlphaPay' }),
    });
    if (!res.ok) throw new Error(`Africa's Talking SMS -> ${res.status} ${await res.text()}`);
    const d = (await res.json()) as { SMSMessageData?: { Recipients?: { messageId?: string }[] } };
    return { id: d.SMSMessageData?.Recipients?.[0]?.messageId ?? 'sent' };
  }

  async sendEmail(to: string, subject: string, body: string): Promise<{ id: string }> {
    const key = this.config.get<string>('SENDGRID_API_KEY');
    if (!key) throw new Error('NOTIFY_USE_STUB=false mais SENDGRID_API_KEY manquant (email)');
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.config.get<string>('EMAIL_FROM') ?? 'noreply@alphapay.co' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid email -> ${res.status} ${await res.text()}`);
    return { id: res.headers.get('x-message-id') ?? 'sent' };
  }
}
