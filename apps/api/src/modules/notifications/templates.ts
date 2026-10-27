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
    version: "v2",
    subject: "Bienvenue chez PayBrain — votre clé API",
    body: "Bonjour {{name}},\n\nVotre compte PayBrain est actif.\n\nVotre clé API de test :\n  {{apiKey}}\n\nConservez-la en lieu sûr — elle ne sera plus affichée.\nVous pouvez en créer d'autres depuis le dashboard.\n\nDocumentation : https://api.paybrain.cg/reference\n\nBonne intégration,\nL'équipe PayBrain",
  },
  "merchant.pending": {
    version: "v1",
    subject: "PayBrain — Demande d'accès reçue",
    body: "Bonjour {{name}},\n\nMerci pour votre inscription sur PayBrain.\n\nVotre demande a bien été reçue et est en cours d'examen par notre équipe.\nVous recevrez un email dès que votre compte sera activé (généralement sous 24–48h ouvrées).\n\nCordialement,\nL'équipe PayBrain",
  },
  "merchant.approved": {
    version: "v1",
    subject: "PayBrain — Compte activé ✓",
    body: "Bonjour {{name}},\n\nVotre compte PayBrain a été validé par notre équipe.\n\nVotre clé API de test :\n  {{apiKey}}\n\nConservez-la en lieu sûr — elle ne sera plus affichée.\nPour obtenir une clé de production, soumettez vos documents KYC depuis le dashboard.\n\nDocumentation : https://api.paybrain.cg/reference\nDashboard : https://dashboard.paybrain.cg\n\nBienvenue,\nL'équipe PayBrain",
  },
  "merchant.rejected": {
    version: "v1",
    subject: "PayBrain — Demande non retenue",
    body: "Bonjour {{name}},\n\nAprès examen, nous ne sommes pas en mesure d'activer votre compte PayBrain pour le motif suivant :\n\n  {{reason}}\n\nSi vous pensez que c'est une erreur, répondez à cet email.\n\nCordialement,\nL'équipe PayBrain",
  },
  /* ── Équipe marchand (Team Members) ── */
  "team.invitation": {
    version: "v1",
    subject: "PayBrain — Invitation à rejoindre {{merchantName}}",
    body: "Bonjour,\n\n{{merchantName}} vous invite à rejoindre son équipe PayBrain avec le rôle {{role}}.\n\nAcceptez l'invitation (valable 7 jours) :\n  {{link}}\n\nSi vous n'attendiez pas cette invitation, ignorez cet email.\n\nL'équipe PayBrain",
  },
  "ops.new-signup": {
    version: "v1",
    subject: "[PayBrain] Nouvelle inscription — {{name}}",
    body: "Nouvel inscrit en attente de validation :\n\nNom    : {{name}}\nEmail  : {{email}}\nType   : {{merchantType}}\nID     : {{merchantId}}\n\nValider ou rejeter :\nhttps://dashboard.paybrain.cg/internal/onboarding/{{merchantId}}",
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
