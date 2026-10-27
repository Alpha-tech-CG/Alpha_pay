import type { IncomingRequest } from '../mobile-money/types';

export type MessageChannel = 'sms' | 'whatsapp' | 'email';
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface SendResult {
  providerMessageId: string;
  /** Coût unitaire annoncé par le fournisseur, s'il est connu. */
  cost?: { amount: number; currency: string };
}

export interface DeliveryEvent {
  providerMessageId: string;
  status: DeliveryStatus;
  failureReason?: string;
}

/** SMS via agrégateur (Infobip, D-009). `to` au format E.164. */
export interface SmsProvider {
  readonly name: string;
  send(input: { to: string; text: string; senderId?: string }): Promise<SendResult>;
  parseDeliveryReport?(req: IncomingRequest): DeliveryEvent[];
}

/**
 * WhatsApp Cloud API. Hors fenêtre de 24 h, seuls les modèles pré-approuvés
 * passent ; les OTP utilisent un modèle de catégorie Authentification.
 */
export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: { to: string; template: string; language: string; variables: string[] }): Promise<SendResult>;
  parseStatusWebhook?(req: IncomingRequest): DeliveryEvent[];
}

/** Email via SMTP générique (D-010). */
export interface EmailProvider {
  readonly name: string;
  send(input: { to: string; subject: string; text: string; html?: string; from?: string }): Promise<SendResult>;
}
