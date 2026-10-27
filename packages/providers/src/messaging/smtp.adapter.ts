import { ProviderError } from '../core/errors';
import type { EmailProvider, SendResult } from './types';

const PROVIDER = 'smtp';

/** Transport minimal (sous-ensemble de nodemailer), remplaçable dans les tests. */
export interface MailTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string; html?: string }): Promise<{ messageId?: string }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Erreurs SMTP : 4xx temporaires (réessayer), 5xx définitives, réseau réessayable. */
function toProviderError(err: any): ProviderError {
  const code = Number(err?.responseCode);
  if (code >= 500) return new ProviderError('rejected', `SMTP ${code}`, { provider: PROVIDER, retryable: false });
  if (code >= 400) return new ProviderError('unavailable', `SMTP ${code}`, { provider: PROVIDER });
  return new ProviderError('network', 'Serveur SMTP injoignable', { provider: PROVIDER });
}

/**
 * Email via SMTP générique (D-010) : Brevo, Amazon SES ou Resend en
 * production, MailHog en local. L'expéditeur doit être vérifié (SPF, DKIM).
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = PROVIDER;

  constructor(
    private readonly transport: MailTransport,
    private readonly defaultFrom: string,
  ) {
    if (!defaultFrom) throw new ProviderError('not_configured', 'SMTP : expéditeur manquant', { provider: PROVIDER });
  }

  async send(input: { to: string; subject: string; text: string; html?: string; from?: string }): Promise<SendResult> {
    if (!EMAIL.test(input.to)) throw new ProviderError('invalid_request', 'Adresse email invalide', { provider: PROVIDER });
    try {
      const info = await this.transport.sendMail({
        from: input.from ?? this.defaultFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      });
      return { providerMessageId: info.messageId ?? `smtp_${Date.now()}` };
    } catch (err) {
      throw toProviderError(err);
    }
  }
}
