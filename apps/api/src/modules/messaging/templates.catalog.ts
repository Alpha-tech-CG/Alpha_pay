import type { MessageCategory, MessageChannel } from '@paybrain/database';

export interface CatalogTemplate {
  key: string;
  channel: MessageChannel;
  version: number;
  category: MessageCategory;
  subject?: string;
  body: string;
  /** Nom du modèle pré-approuvé chez Meta (WhatsApp). */
  whatsappTemplateName?: string;
  /** Ordre des variables transmises au modèle WhatsApp. */
  variables?: string[];
}

/**
 * Catalogue des modèles de messages (§M9), en français. Versionnés : pour
 * modifier un texte, AJOUTER une entrée avec `version + 1` (l'ancienne reste
 * pour l'historique). Synchronisé en base au démarrage (ajout seul).
 * Vocabulaire interdit (§4.4) : jamais « solde AlphaPay », « nous encaissons ».
 */
export const TEMPLATE_CATALOG: CatalogTemplate[] = [
  // ── Codes à usage unique (OTP) ──
  {
    key: 'otp.code',
    channel: 'SMS',
    version: 1,
    category: 'OTP',
    body: 'AlphaPay : votre code de vérification est {{code}}. Il expire dans 5 minutes. Ne le communiquez à personne.',
  },
  {
    key: 'otp.code',
    channel: 'WHATSAPP',
    version: 1,
    category: 'OTP',
    body: '{{code}} est votre code de vérification AlphaPay.',
    whatsappTemplateName: 'alphapay_otp',
    variables: ['code'],
  },
  {
    key: 'otp.code',
    channel: 'EMAIL',
    version: 1,
    category: 'OTP',
    subject: 'Votre code de vérification AlphaPay',
    body: 'Bonjour,\n\nVotre code de vérification est : {{code}}\n\nIl expire dans 5 minutes. Ne le communiquez à personne : AlphaPay ne vous le demandera jamais.\n\nL’équipe AlphaPay',
  },
  // OTP envoyés par un marchand via l'API Messages (au nom du marchand).
  {
    key: 'otp.code_marchand',
    channel: 'SMS',
    version: 1,
    category: 'OTP',
    body: '{{merchantName}} : votre code de vérification est {{code}}. Il expire dans 5 minutes.',
  },
  {
    key: 'otp.code_marchand',
    channel: 'WHATSAPP',
    version: 1,
    category: 'OTP',
    body: '{{code}} est votre code de vérification.',
    whatsappTemplateName: 'alphapay_otp',
    variables: ['code'],
  },
  {
    key: 'otp.code_marchand',
    channel: 'EMAIL',
    version: 1,
    category: 'OTP',
    subject: '{{merchantName}} — votre code de vérification',
    body: 'Bonjour,\n\nVotre code de vérification {{merchantName}} est : {{code}}\n\nIl expire dans 5 minutes.',
  },

  // ── Vérif : confirmation de paiement reçu (§M5) ──
  {
    key: 'verif.paiement_recu',
    channel: 'SMS',
    version: 1,
    category: 'TRANSACTIONAL',
    body: 'Paiement reçu : {{amount}} de {{payer}}, {{operator}}, réf. {{reference}}',
  },
  {
    key: 'verif.paiement_recu',
    channel: 'WHATSAPP',
    version: 1,
    category: 'TRANSACTIONAL',
    body: 'Paiement reçu : {{amount}} de {{payer}}, {{operator}}, réf. {{reference}}',
    whatsappTemplateName: 'alphapay_paiement_recu',
    variables: ['amount', 'payer', 'operator', 'reference'],
  },

  // ── Lien de paiement partagé (§M4) ──
  {
    key: 'lien.paiement',
    channel: 'SMS',
    version: 1,
    category: 'TRANSACTIONAL',
    body: '{{merchantName}} : {{description}} ({{amount}}). Payez par Mobile Money : {{link}}',
  },
  {
    key: 'lien.paiement',
    channel: 'WHATSAPP',
    version: 1,
    category: 'TRANSACTIONAL',
    body: '{{merchantName}} : {{description}} ({{amount}}). Payez par Mobile Money : {{link}}',
    whatsappTemplateName: 'alphapay_lien_paiement',
    variables: ['merchantName', 'description', 'amount', 'link'],
  },

  // ── Équipe : invitation (§M1) ──
  {
    key: 'equipe.invitation',
    channel: 'SMS',
    version: 1,
    category: 'TRANSACTIONAL',
    body: '{{merchantName}} vous invite sur AlphaPay comme {{role}}. Acceptez (7 jours) : {{link}}',
  },
  {
    key: 'equipe.invitation',
    channel: 'WHATSAPP',
    version: 1,
    category: 'TRANSACTIONAL',
    body: '{{merchantName}} vous invite sur AlphaPay comme {{role}}. Acceptez (7 jours) : {{link}}',
    whatsappTemplateName: 'alphapay_invitation_equipe',
    variables: ['merchantName', 'role', 'link'],
  },
  {
    key: 'equipe.invitation',
    channel: 'EMAIL',
    version: 1,
    category: 'TRANSACTIONAL',
    subject: '{{merchantName}} vous invite sur AlphaPay',
    body: 'Bonjour,\n\n{{merchantName}} vous invite à rejoindre son équipe sur AlphaPay avec le rôle {{role}}.\n\nAcceptez l’invitation (valable 7 jours) :\n{{link}}\n\nSi vous n’attendiez pas cette invitation, ignorez ce message.\n\nL’équipe AlphaPay',
  },

  // ── Notification d'un marchand via l'API Messages (seul format WhatsApp autorisé hors fenêtre de 24 h) ──
  { key: 'message.notification', channel: 'SMS', version: 1, category: 'TRANSACTIONAL', body: '{{merchantName}} : {{text}}' },
  {
    key: 'message.notification',
    channel: 'WHATSAPP',
    version: 1,
    category: 'TRANSACTIONAL',
    body: 'Message de {{merchantName}} : {{text}}',
    whatsappTemplateName: 'alphapay_notification',
    variables: ['merchantName', 'text'],
  },
  {
    key: 'message.notification',
    channel: 'EMAIL',
    version: 1,
    category: 'TRANSACTIONAL',
    subject: '{{subject}}',
    body: '{{text}}\n\n— {{merchantName}}',
  },

  // ── Message libre de l'API Messages (SMS et email seulement : WhatsApp exige un modèle) ──
  { key: 'message.libre', channel: 'SMS', version: 1, category: 'TRANSACTIONAL', body: '{{text}}' },
  { key: 'message.libre', channel: 'EMAIL', version: 1, category: 'TRANSACTIONAL', subject: '{{subject}}', body: '{{text}}' },
];
