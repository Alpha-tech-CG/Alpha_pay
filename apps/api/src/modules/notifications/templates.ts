export interface NotificationTemplate {
  version: string;
  subject: string;
  body: string;
}

export const TEMPLATES: Record<string, NotificationTemplate> = {
  "reconciliation.alert": {
    version: "v1",
    subject: "PayBrain - Ecart de reconciliation",
    body: "Ecart {{operator}} le {{date}} : {{maxDiscrepancy}} centimes ({{discrepancyCount}} ecart(s), run {{runId}}). Verification requise.",
  },
  "reconciliation.summary": {
    version: "v1",
    subject: "PayBrain - Rapport de reconciliation",
    body: "Reconciliation {{operator}} du {{date}} terminee : {{matchedCount}} rapprochement(s), {{discrepancyCount}} ecart(s), run {{runId}}.",
  },
  "webhook.failed": {
    version: "v1",
    subject: "PayBrain - Echec de livraison webhook",
    body: "Votre endpoint {{url}} a echoue definitivement apres {{attempts}} tentatives ({{reason}}). Verifiez sa disponibilite.",
  },
  "payment.succeeded": {
    version: "v1",
    subject: "PayBrain - Paiement recu",
    body: "Paiement {{externalId}} de {{amount}} {{currency}} confirmé.",
  },
  "merchant.welcome": {
    version: "v1",
    subject: "Bienvenue chez PayBrain",
    body: "Bonjour {{name}}, votre compte marchand est actif. Bon encaissement !",
  },
};

export interface RenderedTemplate {
  version: string;
  subject: string;
  body: string;
}

export function renderTemplate(
  key: string,
  data: Record<string, unknown>,
): RenderedTemplate {
  const template = TEMPLATES[key];
  if (!template) throw new Error(`Template inconnu: ${key}`);
  const fill = (value: string) =>
    value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) =>
      data[name] != null ? String(data[name]) : "",
    );
  return {
    version: template.version,
    subject: fill(template.subject),
    body: fill(template.body),
  };
}
