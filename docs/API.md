# API publique AlphaPay (v1)

Référence complète, générée depuis le code : [`docs/api/openapi.json`](api/openapi.json)
(OpenAPI 3.1, régénérée par `pnpm --filter @paybrain/api openapi`). Portail
développeurs en français avec exemples curl, Node.js et PHP : `GET /docs` sur l'API
(guide : `apps/api/src/openapi/guide.md`).

## Accès

- Base : `https://api.alphapay.cg/v1` (local : `http://localhost:3000/v1`).
- Authentification : `Authorization: Bearer ap_test_…` ou `ap_live_…`. Les clés se
  créent dans **Développeurs → Clés API** ; le secret n'est affiché qu'une fois.
- **Mode** : porté par la clé. Une clé `ap_test_` ne voit que les données de test
  (opérateur factice ou sandbox), une clé `ap_live_` que les données réelles. Les clés
  `ap_live_` ne s'obtiennent qu'après validation du dossier entreprise (KYB).
- Montants en **unités majeures** : XAF en francs entiers (`15000`), EUR du sandbox
  MTN en euros. Téléphones au format local (`061234567`) ou E.164 (`+242061234567`).

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/v1/payments` | Créer un paiement (MTN, Airtel ; carte si activée) — `Idempotency-Key` obligatoire |
| GET | `/v1/payments/:id` | Lire un paiement |
| GET | `/v1/payments` | Lister (pagination par curseur) |
| POST | `/v1/payment-links` | Créer un lien de paiement (montant fixe ou libre, expiration, usage unique ou multiple) |
| GET | `/v1/payment-links/:id` | Lire un lien |
| POST | `/v1/customers` | Créer un client (canaux des relances et reçus) |
| GET | `/v1/customers/:id` | Lire un client |
| POST | `/v1/invoices` | Créer une facture (lignes, échéance ou échéancier ; `send: true` pour l'envoyer) |
| GET | `/v1/invoices/:id` | Lire une facture (statut, échéancier, lien du prochain versement, reçus) |
| GET | `/v1/invoices` | Lister les factures |
| POST | `/v1/invoices/:id/send` | Envoyer une facture en brouillon |
| POST | `/v1/messages` | Envoyer un SMS, un WhatsApp ou un email (consomme des crédits) |
| GET | `/v1/messages/:id` | Statut d'un message |
| POST | `/v1/otp/send` | Envoyer un code à usage unique |
| POST | `/v1/otp/verify` | Vérifier un code |
| GET | `/v1/credits` | Solde de crédits de messages |

Les routes `/v1/merchants/:merchantId/…` servent le tableau de bord (session
utilisateur, contrôle par rôle) et ne font pas partie de l'API publique.

## Conventions

- **Idempotence** : `Idempotency-Key` (UUID v4) accepté sur tous les `POST`,
  conservé 24 h. Même clé, même corps → même réponse (`Idempotency-Replayed: true`) ;
  même clé, autre corps → `422`.
- **Pagination** : `limit` (1 à 100, défaut 20) et `starting_after=<next_cursor>`
  tant que `has_more` vaut `true`.
- **Erreurs** : toujours `{ "error": { "code": "…", "message": "…", "param": "…" } }`.

| HTTP | Sens | Exemples de `code` |
|---|---|---|
| 400 | Requête invalide | `validation_echouee`, `curseur_invalide` |
| 401 | Clé absente ou invalide | `non_authentifie` |
| 402 | Crédits de messages insuffisants | `credits_insuffisants` |
| 403 | Droits, palier ou KYB | `kyb_non_valide`, `module_non_inclus`, `lecture_seule` |
| 404 | Introuvable | `paiement_introuvable`, `facture_introuvable`, `client_introuvable` |
| 409 | Conflit d'état | `facture_deja_payee`, `facture_non_modifiable` |
| 422 | Règle métier | `operateur_non_connecte`, `echeancier_incoherent` |
| 429 | Limite de débit | `trop_de_requetes` (en-têtes `RateLimit-*`) |

- **Limites** : par clé API, en-têtes `RateLimit-Limit`, `RateLimit-Remaining`,
  `RateLimit-Reset`. `POST /v1/payments` : 20 par minute et par IP en plus.

## Statuts

- Paiement : `en_attente`, `réussi`, `échoué`, `expiré`, `annulé`.
- Facture : `brouillon`, `envoyée`, `partiellement_payée`, `payée`, `en_retard`, `annulée`.
- Versement : `en_attente`, `payé`, `annulé`.

## Webhooks

Déclarés dans **Développeurs → Webhooks** (URL publique HTTPS en live). Événements :
`payment.succeeded`, `payment.failed`, `payment.expired`, `invoice.paid`,
`installment.paid`, `message.delivered`, `message.failed`.

- Signature : en-tête `AlphaPay-Signature: t=<horodatage>,v1=<HMAC-SHA256>` calculé sur
  `<t>.<corps brut>` avec le secret de l'endpoint ; refuser au-delà de 5 min (rejeu).
  Exemples de vérification Node.js et PHP dans le portail.
- Nouvelles tentatives sur 24 h (1 min, 5 min, 30 min, 2 h, 6 h, 15 h) ; dédoublonner sur
  l'`id` de l'événement ; renvoi manuel depuis le tableau de bord.

## Mode test

Opérateur factice, sans compte : `060000001` réussit, `060000002` échoue (refus du
payeur), `060000003` répond lentement puis réussit, `060000004` expire. Les messages
de test ne partent pas réellement (MailHog en local pour les emails).
