# Journal des décisions — AlphaPay V1

> Décisions prises sans bloquer, faute de précision dans le cahier des charges ou pour le concilier
> avec l'existant. Toute décision peut être revue par Miche ; une révision s'ajoute en bas, on ne
> réécrit pas l'historique.

| ID | Date | Décision | Raison |
|---|---|---|---|
| D-001 | 2026-10-27 | Le backend V1 reste **NestJS 11 (adaptateur Express) + Prisma** dans `apps/api`. | NestJS tourne sur Express ; l'existant (sécurité, idempotence, tests verts) est solide. Réécrire en Express pur coûterait des semaines sans gain. |
| D-002 | 2026-10-27 | Le **cahier des charges remplace** les documents antérieurs (`ROADMAP_MODULES.md`, `PROD_READINESS.md`, `GO_LIVE_CHECKLIST.md`, etc.), archivés dans `docs/archive/`. | §0 : « ce fichier est la source de vérité ». |
| D-003 | 2026-10-27 | Les modules qui détiennent ou font transiter des fonds (`wallet`, `ledger`, `settlement`, `fees`, `partners`, `routing`, `currency`) et `ussd` sont **retirés** de la V1 (code supprimé, tables supprimées par migration ; historique conservé dans Git). | Contrainte fondatrice §1 et exclusions §3.2 (« ne pas développer, même partiellement »). |
| D-004 | 2026-10-27 | `apps/alphapay-backend`, `apps/prototype` et `mobile/` sont **gelés** : exclus du build et de la CI, non supprimés. | Hors périmètre V1 (apps natives exclues, backend non déployé). Pas de destruction sans besoin. |
| D-005 | 2026-10-27 | **Clerk est retiré** au profit d'une authentification maison (Argon2id, mot de passe + OTP, refresh révocable). Remplace la décision antérieure « 1A Clerk SDK » de la feature équipe. | M1 exige OTP au choix SMS/WhatsApp/email et révocation de sessions maîtrisée ; le cahier des charges prime. |
| D-006 | 2026-10-27 | **Hypothèse d'accès opérateur** : chaque marchand dispose de **son propre compte API** chez MTN (API user + clé + clé d'abonnement Collection) et chez Airtel (client id/secret). Les identifiants sont stockés par marchand dans `provider_connections`, chiffrés. La résolution des identifiants est faite **dans l'adaptateur** (méthode `resolveCredentials`), seul endroit à modifier si le modèle devient « compte partenaire AlphaPay + sous-comptes ». | §4.3 ; à confirmer avec MTN et Airtel. |
| D-007 | 2026-10-27 | Montants stockés en **unités mineures selon l'exposant ISO 4217** de la devise (`BIGINT`) : XAF exposant 0 → francs entiers ; EUR (sandbox) exposant 2 → centimes. Les montants XAF existants (stockés ×100) sont convertis par migration. | §4.1 : XAF en entiers, sandbox EUR configurable, jamais de float. |
| D-008 | 2026-10-27 | File de tâches : **BullMQ** sur Redis, worker dans un process séparé issu du même code (`apps/api`, point d'entrée `worker`). Les crons existants deviennent des tâches répétables BullMQ. | §8.2 ; BullMQ déjà connu de l'équipe (utilisé dans `alphapay-backend`), retries + file des échecs natifs. |
| D-009 | 2026-10-27 | Fournisseur SMS : **Infobip**. | Couverture directe Afrique centrale, nom d'expéditeur alphanumérique, webhooks de livraison ; Twilio plus cher et moins direct sur le Congo. Adaptateur derrière `SmsProvider`, interchangeable. |
| D-010 | 2026-10-27 | Email : adaptateur **SMTP générique** (nodemailer) ; fournisseur recommandé **Brevo** (Amazon SES en alternative). MailHog en local. | §M9 ; SMTP évite tout verrouillage fournisseur. |
| D-011 | 2026-10-27 | Suivi des erreurs : **Sentry** (déjà intégré). Journaux : **pino** JSON avec `request_id` et masquage PII. Métriques : Prometheus (`prom-client`, déjà intégré). | §8.4 ; réutilisation de l'existant. |
| D-012 | 2026-10-27 | Fournisseurs (opérateurs, KYC, SMS, WhatsApp, email, carte) regroupés dans un paquet **`packages/providers`** (interfaces + adaptateurs + mocks + tests de contrat), qui remplace `packages/connectors`. CinetPay est retiré. | §2.7 ; CinetPay est un agrégateur qui encaisserait à la place du marchand (contraire à §1). |
| D-013 | 2026-10-27 | Fronts : on garde **React + Vite** pour `dashboard/` (devient PWA via `vite-plugin-pwa`) et `admin/` ; ils passent dans le workspace pnpm (`apps/dashboard`, `apps/admin`) et migrent progressivement vers TypeScript (nouveaux fichiers en `.tsx`). | Conforme à la stack déclarée ; évite une réécriture. |
| D-014 | 2026-10-27 | Page de paiement hébergée : servie par le **backend** (`/pay/...`) en HTML rendu côté serveur + un petit script, sans framework, pour tenir < 200 Ko en 3G. `apps/checkout` (Next.js) est retiré après migration. | §8.3 ; un bundle Next.js dépasse aisément le budget et ajoute un service à déployer. |
| D-015 | 2026-10-27 | Hébergement préprod et prod : **VPS OVH** avec `docker-compose.prod.yml`, conformément à la décision du 5 octobre 2026. `terraform/` (AWS) est conservé mais n'est plus la cible ; aucune ressource AWS n'est détruite sans accord. | Coût ; décision antérieure de Miche. |
| D-016 | 2026-10-27 | Statuts de paiement : enum Postgres en ASCII (`pending`, `succeeded`, `failed`, `expired`, `canceled`) ; libellés français (`en_attente`, `réussi`, `échoué`, `expiré`, `annulé`) dans l'API publique et l'interface via un mappage unique. | Identifiants SQL sans accents (portabilité, outils) ; l'API expose les termes exigés par §M3. |
| D-017 | 2026-10-27 | Codes d'erreur API en `snake_case` sans accent (ex. `credits_insuffisants`, `kyb_non_valide`). | Conforme à l'exemple §7 ; robustesse des clients HTTP. |
| D-018 | 2026-10-27 | Pas de compatibilité ascendante pour les clés `pk_*` ni l'en-tête `X-Signature-256` : aucun marchand en production. | Simplicité. |
| D-019 | 2026-10-27 | Clerk (D-005) est retiré **en même temps** que l'auth maison est livrée (T-30/T-31), pas avant. | Ne jamais laisser le tableau de bord sans authentification entre deux commits. |
| D-020 | 2026-10-27 | Anti-doublon opérateur : l'identifiant de transaction envoyé à MTN (`X-Reference-Id`) et à Airtel (`transaction.id`) est **dérivé de la référence AlphaPay** (UUID déterministe). Rejouer une demande après une coupure réseau renvoie 409 chez l'opérateur, traité comme « déjà acceptée ». | §M3 : couper le réseau ne crée ni doublon ni paiement bloqué. |
| D-021 | 2026-10-27 | Un callback opérateur n'est jamais cru sur parole : il déclenche une lecture du statut par `getPaymentStatus` avant tout passage à `réussi`. | MTN n'authentifie pas ses callbacks ; défense en profondeur. |
| D-022 | 2026-10-27 | Production MTN Congo : `https://proxy.momoapi.mtn.com`, `X-Target-Environment: mtncongo` ; surchargeables par connexion (`baseUrl`, `targetEnvironment`). Airtel : `/merchant/v2/payments/` repris de l'existant, numéro **national** sans indicatif. **À valider dès réception des accès** (aucun sandbox Airtel testé à ce jour). | Valeurs usuelles des documentations opérateurs ; isolées dans l'adaptateur. |
| D-023 | 2026-10-27 | Opérateur factice **sans état partagé** : la référence fournisseur encode scénario et instant de création, pour que l'API et le worker (deux process) lisent le même statut. Numéros de test : `+242060000001` succès, `…02` échec, `…03` lent, `…04` expiration, `…05` erreur réseau, `…06` titulaire inactif ; tout autre numéro réussit après 3 s. | §M3 mock ; fonctionne de bout en bout en local sans base partagée par le mock. |
| D-025 | 2026-10-27 | Préfixes opérateurs du Congo dans `packages/shared/src/config/operators.cg.json` (MTN `06`, Airtel `05` et `04`), surchargeables par `PHONE_OPERATOR_PREFIXES` (JSON). Le préfixe le plus long l'emporte ; un préfixe inconnu ou un numéro étranger impose un choix explicite de l'opérateur. | §4.2 : plages dans la configuration ; `04` (ex-Warid) rattaché à Airtel, à confirmer. |
| D-026 | 2026-10-27 | Affichage des montants : `15 000 XAF` avec **espaces insécables** (U+00A0) comme séparateur de milliers et avant la devise ; virgule décimale pour l'EUR (`1 250,50 EUR`). | §4.1 ; un montant ne doit jamais se couper en fin de ligne. |
| D-027 | 2026-10-27 | Codes d'erreur par défaut selon le statut : `requete_invalide`, `non_authentifie`, `credits_insuffisants`, `acces_refuse`, `introuvable`, `conflit`, `regle_metier`, `trop_de_requetes`, `erreur_interne`, `fournisseur_indisponible` ; validation → `validation_echouee` avec `param`. Identifiant de corrélation dans `request_id`. | §7 et D-017. |
| D-024 | 2026-10-27 | `packages/connectors` reste en place tant que les paiements ne sont pas branchés sur le registre de fournisseurs (T-06/T-41) ; il sera supprimé à ce moment-là. | Commits petits et toujours verts. |

## Actions sensibles couvertes par le journal d'audit (§M12)

Liste tenue à jour au fil des modules :

- Comptes : inscription, connexion réussie/échouée, blocage OTP, réinitialisation de mot de passe, déconnexion de toutes les sessions.
- Équipe : invitation, acceptation, changement de rôle, retrait, transfert de propriété, rattachement à une caisse.
- KYB/KYC : soumission, changement d'état, consultation d'une pièce, décision (avec motif).
- Opérateurs : création, modification, suppression d'une connexion.
- Développeurs : création/révocation de clé API, création/modification/suppression d'endpoint webhook, renvoi manuel.
- Encaissement : création/désactivation de lien, génération de QR, saisie de cash déclaré, changement de statut de rapprochement, import de relevé, export.
- Recouvrement : annulation de facture, modification du calendrier de relances.
- Facturation : changement de palier, achat de crédits, passage en lecture seule.
- Back-office : toute action (décision KYB, suspension/réactivation, modification de palier/prix/pack, consultation d'une fiche marchand).
