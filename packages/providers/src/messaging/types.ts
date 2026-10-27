import type { IncomingRequest } from '../mobile-money/types';

export type MessageChannel = 'sms' | 'whatsapp' | 'email';
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageCost {
  /** Montant en unités mineures de la devise (D-007). */
  amount: number;
  currency: string;
}

export interface SendResult {
  providerMessageId: string;
  /** Coût unitaire annoncé par le fournisseur, s'il est connu à l'envoi. */
  cost?: MessageCost;
}

export interface DeliveryEvent {
  providerMessageId: string;
  status: DeliveryStatus;
  failureReason?: string;
  /** Coût réel communiqué avec l'accusé de livraison, s'il y en a un. */
  cost?: MessageCost;
}

/** Message reçu d'un destinataire (ex. réponse « STOP »). `from` au format E.164. */
export interface InboundMessage {
  from: string;
  text: string;
}

/** SMS via agrégateur (Infobip, D-009). `to` au format E.164. */
export interface SmsProvider {
  readonly name: string;
  send(input: { to: string; text: string; senderId?: string }): Promise<SendResult>;
  parseDeliveryReport?(req: IncomingRequest): DeliveryEvent[];
  parseInbound?(req: IncomingRequest): InboundMessage[];
}

/**
 * WhatsApp Cloud API. Hors fenêtre de 24 h, seuls les modèles pré-approuvés
 * passent ; les OTP utilisent un modèle de catégorie Authentification, dont le
 * bouton « copier le code » reçoit `authenticationCode`.
 */
export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: {
    to: string;
    template: string;
    language: string;
    variables: string[];
    authenticationCode?: string;
  }): Promise<SendResult>;
  /** Vérifie la signature du webhook ; lève ProviderError `invalid_signature` si elle est fausse. */
  parseStatusWebhook?(req: IncomingRequest): DeliveryEvent[];
  parseInbound?(req: IncomingRequest): InboundMessage[];
}

/** Email via SMTP générique (D-010). */
export interface EmailProvider {
  readonly name: string;
  send(input: { to: string; subject: string; text: string; html?: string; from?: string }): Promise<SendResult>;
}
