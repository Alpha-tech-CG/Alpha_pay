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
  /* ── Wallet client (SMS) ── */
  "wallet.cashin.success": {
    version: "v1",
    subject: "PayBrain – Rechargement reçu",
    body: "PayBrain : votre wallet a été crédité de {{amount}} {{currency}}. Solde : {{balance}} {{currency}}.",
  },
  "wallet.cashin.failed": {
    version: "v1",
    subject: "PayBrain – Rechargement échoué",
    body: "PayBrain : votre rechargement de {{amount}} {{currency}} via {{operator}} a échoué. Réessayez depuis l'app.",
  },
  "wallet.cashout.success": {
    version: "v1",
    subject: "PayBrain – Retrait effectué",
    body: "PayBrain : retrait de {{amount}} {{currency}} vers {{operator}} ({{phone}}) effectué. Solde restant : {{balance}} {{currency}}.",
  },
  "wallet.cashout.failed": {
    version: "v1",
    subject: "PayBrain – Retrait échoué",
    body: "PayBrain : votre retrait de {{amount}} {{currency}} a échoué. Votre solde a été restitué intégralement.",
  },
  "wallet.p2p.received": {
    version: "v1",
    subject: "PayBrain – Argent reçu",
    body: "PayBrain : vous avez reçu {{amount}} {{currency}} de {{from}}. Solde : {{balance}} {{currency}}.",
  },
  "wallet.otp": {
    version: "v1",
    subject: "PayBrain – Code de vérification",
    body: "PayBrain : votre code de vérification est {{otp}}. Valable 10 minutes. Ne le partagez jamais — PayBrain ne vous le demandera jamais.",
  },
  "wallet.locked": {
    version: "v1",
    subject: "PayBrain – Compte verrouillé",
    body: "PayBrain : votre compte est temporairement verrouillé après plusieurs PIN incorrects. Réessayez dans {{minutes}} min. Si ce n'était pas vous, contactez le support.",
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
