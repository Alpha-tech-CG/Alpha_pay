// Registre de templates versionnés (ALP-143). Code-based pour le MVP ; migrable
// vers DB ou fichiers .mjml sans changer l'API du NotificationService.

export interface NotificationTemplate {
  version: string;
  subject: string; // utilisé pour l'email
  body: string; // corps SMS / email (texte), avec placeholders {{var}}
}

export const TEMPLATES: Record<string, NotificationTemplate> = {
  'reconciliation.alert': {
    version: 'v1',
    subject: 'PayBrain — Écart de réconciliation',
    body: 'Écart {{operator}} le {{date}} : {{maxDiscrepancy}} centimes ({{discrepancyCount}} écart(s), run {{runId}}). Vérification requise.',
  },
  'webhook.failed': {
    version: 'v1',
    subject: 'PayBrain — Échec de livraison webhook',
    body: 'Votre endpoint {{url}} a échoué définitivement après {{attempts}} tentatives ({{reason}}). Vérifiez sa disponibilité.',
  },
  'payment.succeeded': {
    version: 'v1',
    subject: 'PayBrain — Paiement reçu',
    body: 'Paiement {{externalId}} de {{amount}} {{currency}} confirmé.',
  },
  'merchant.welcome': {
    version: 'v1',
    subject: 'Bienvenue chez PayBrain',
    body: 'Bonjour {{name}}, votre compte marchand est actif. Bon encaissement !',
  },
};

export interface RenderedTemplate {
  version: string;
  subject: string;
  body: string;
}

/** Substitue les {{placeholders}} ; un placeholder sans valeur devient ''. */
export function renderTemplate(key: string, data: Record<string, unknown>): RenderedTemplate {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`Template inconnu: ${key}`);
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (data[k] != null ? String(data[k]) : ''));
  return { version: tpl.version, subject: fill(tpl.subject), body: fill(tpl.body) };
}
