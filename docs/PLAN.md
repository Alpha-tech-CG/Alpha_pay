# Plan de réalisation — AlphaPay V1

> Écart entre l'existant (`docs/AUDIT.md`) et le cahier des charges, découpé en tâches dans l'ordre
> des jalons (§12). Livraison unique : **27 décembre 2026**. Identifiants `T-xx` repris dans les commits.
> Légende charge : S (< ½ j), M (½–2 j), L (2–5 j).

---

## S1 — Socle (27 oct. → 2 nov.)

| ID | Tâche | Charge |
|---|---|---|
| T-01 | `AUDIT.md`, `PLAN.md`, `DECISIONS.md`, `PROGRESS.md` | S ✅ |
| T-02 | Nettoyage racine : archives `.zip`, logs, `plan.out`, résidus (`src/`, `tmp/`, `paybrain/`) ; archiver les anciennes docs dans `docs/archive/` | S ✅ |
| T-03 | Retirer de `apps/api` les modules hors périmètre : `wallet`, `ledger`, `settlement`, `fees`, `partners`, `routing`, `currency`, `ussd` ; supprimer `disburse` des connecteurs ; migration de suppression des tables | M ✅ |
| T-04 | Geler `apps/alphapay-backend`, `apps/prototype`, `mobile/` (exclus du build/CI turbo) | S ✅ |
| T-05 | Arborescence fournisseurs : `packages/providers` avec interfaces `MobileMoneyProvider`, `KycProvider`, `SmsProvider`, `WhatsAppProvider`, `EmailProvider`, `CardAcquirer` + **adaptateurs mock** + **suite de tests de contrat** commune | L ✅ |
| T-06 | Registre de fournisseurs (injection Nest) piloté par configuration (`*_PROVIDER=mock|mtn|…`) ; brancher paiements, webhooks entrants et outbox dessus ; supprimer `packages/connectors` (D-024) | M ✅ |
| T-07 | File de tâches **BullMQ** (Redis) : module `queue`, retries exponentiels, file des échecs, métriques de durée ; worker lancé comme process séparé (`apps/api` en mode `worker`) | M ✅ |
| T-08 | Socle transversal : format d'erreur §7, codes métiers, validation par schéma sur chaque route, journaux JSON (pino) avec `request_id` propagé et masquage PII, `/health` + `/ready` | M ✅ |
| T-09 | Montants : `money.ts` par exposant ISO 4217 (XAF=0, EUR=2), formatage `15 000 XAF`, migration des montants existants | S ✅ |
| T-10 | Téléphones : normalisation E.164 Congo (+242 0xxxxxxxx) et détection d'opérateur **depuis la config** (`config/operators.cg.json`) | S ✅ |
| T-11 | Colonne `livemode` : convention Prisma + extension/middleware de filtrage obligatoire | M ✅ |
| T-12 | `docker-compose.yml` : api + worker + dashboard + admin + checkout + Postgres + Redis + MailHog, mocks par défaut, `pnpm dev:up` en une commande ; observabilité dans un fichier séparé | M ✅ |
| T-13 | CI : lint + tests unitaires + intégration (Postgres + Redis services) + build + `pnpm audit` ; exclure les apps gelées | S ✅ |
| T-14 | `.env.example` complet et commenté, validation de la config au démarrage (échec explicite) | S ✅ |

## S2–S3 — M1 Comptes, M9 Messages/OTP, M3 Connecteurs (3 → 16 nov.)

### M9 Messages et OTP (en premier : M1 en dépend)
| ID | Tâche | Charge |
|---|---|---|
| T-20 | Tables `message_templates` (versionnés), `messages`, `message_preferences`, `opt_outs`, `otp_audit` | M ✅ |
| T-21 | Service d'envoi : rendu de modèle, envoi via file, retries (réseau/5xx/429), **bascule de canal**, journal masqué, coût | L ✅ |
| T-22 | Adaptateurs réels : SMS **Infobip**, WhatsApp **Meta Cloud API**, email **SMTP** (nodemailer) ; webhooks de statut (envoyé/livré/lu/échoué) idempotents ; STOP | L ✅ |
| T-23 | Service OTP : 6 chiffres CSPRNG, HMAC-SHA256 dans Redis TTL 5 min, lié à (destination, usage), temps constant, usage unique, 5 essais → 15 min, 60 s entre envois, plafonds par destination et IP, jamais journalisé | M ✅ |
| T-24 | Tests : unitaires OTP, bascule WhatsApp→SMS, aucun code dans les logs | M ✅ |

### M1 Comptes, authentification, rôles
| ID | Tâche | Charge |
|---|---|---|
| T-30 | Retrait de Clerk (backend + dashboard + admin) ; `users` (Argon2id), `sessions` (refresh haché, révocable) | M ✅ |
| T-31 | Inscription, connexion mot de passe → OTP (canal au choix), refresh, déconnexion, déconnexion de toutes les sessions, réinitialisation par OTP | L ✅ |
| T-32 | Rôles marchand Propriétaire/Administrateur/Comptable/Caissier/Développeur ; migration de l'enum existant ; matrice de permissions ; invitations par téléphone ou email | M ✅ |
| T-33 | Retrait d'un membre = révocation immédiate des sessions (vérification de l'appartenance à chaque requête) | S ✅ |
| T-34 | Tests d'intégration du contrôle d'accès par rôle | M ✅ |

### M3 Connecteurs opérateurs
| ID | Tâche | Charge |
|---|---|---|
| T-40 | Table `provider_connections` (identifiants **du marchand**, AES-256-GCM, clé maîtresse en env), statut « en attente de connexion », guide pas à pas dans le dashboard | M ✅ |
| T-41 | Adaptateur **MTN** conforme à l'interface (sandbox EUR / prod XAF, URL, identifiants par marchand), jetons en cache Redis | M ✅ |
| T-42 | Adaptateur **Airtel** conforme à l'interface | M ✅ |
| T-43 | Adaptateur **mock** : succès / échec / délai / expiration selon numéros de test documentés | S ✅ |
| T-44 | Statuts unifiés + machine d'état ; tâche de relance à intervalles croissants jusqu'à statut final ou expiration ; callbacks idempotents ; anti-doublon (coupure réseau) | M ✅ |

## S4–S5 — M4 Encaisser, M5 Vérif, M10 Développeurs, M2 KYB/KYC (17 → 30 nov.)

| ID | Tâche | Charge |
|---|---|---|
| T-50 | Structure `stores`, `tills`, `till_members` (prérequis M4/M5/M6) | M ✅ |
| T-51 | API `/v1/payments` (POST/GET/liste par curseur) unifiée, `Idempotency-Key` 24 h, KYB requis en live | M ✅ |
| T-52 | Liens de paiement : montant fixe/libre, expiration, usage unique/multiple, partage WhatsApp/SMS ; `/v1/payment-links` | M |
| T-53 | Page de paiement hébergée allégée (< 200 Ko, 3G, suivi temps réel par SSE/polling, couleurs et polices AlphaPay) | L |
| T-54 | QR unique par boutique/caisse, PDF A5 et A6 (nom marchand, logos MTN/Airtel) | M |
| T-55 | Vérif : web push (VAPID) + SSE, notification < 5 s, SMS/WhatsApp en option par caisse, écran **Caisse** ; mention de la limite (paiements hors AlphaPay invisibles) | L |
| T-56 | Clés `ap_test_`/`ap_live_` (affichage unique), journal des requêtes API 30 j, rate-limit par clé + en-têtes `RateLimit-*` | M |
| T-57 | Webhooks : `AlphaPay-Signature` (t=…, v1=…), retries 24 h, journal + bouton « renvoyer », événements §7 | M |
| T-58 | OpenAPI 3.1 générée, portail développeurs FR (démarrage, auth, paiements, webhooks, messages, OTP, erreurs, numéros de test), exemples curl/Node/PHP, exemple de vérification de signature | L |
| T-59 | KYB : `kyb_applications`, `kyb_documents`, `kyb_events`, états brouillon→soumis→en_revue→approuvé/infos_requises/refusé, fichiers chiffrés + URL signées, notification à chaque changement | M |
| T-60 | KYC : `KycProvider` Sumsub + mock (demandeur, lien, webhook), `kyc_checks` ; remplacement de Smile ID | M |
| T-61 | Garde « live » côté API : pas de clé `ap_live_` ni de paiement live sans KYB approuvé | S ✅ |

## S6–S7 — M6 Gérer, M7 Recouvrer, M8 Pack École, M11 Facturation (1 → 14 déc.)

| ID | Tâche | Charge |
|---|---|---|
| T-70 | Transactions : filtres complets, détail, indices ; indicateurs jour/semaine/mois, répartition opérateur, taux d'échec | M |
| T-71 | Cash déclaré (`cash_entries`) par caissier | S |
| T-72 | Rapprochement journalier par caisse (`reconciliation_days`), statuts, commentaire ; import CSV relevé (réutilise `statement-parser`) | M |
| T-73 | Exports CSV/Excel en tâche de fond (10 000 lignes), lien de téléchargement | M |
| T-74 | Recouvrer : `customers`, `invoices`, `invoice_lines`, PDF, lien intégré ; `/v1/invoices`, `/v1/customers` | L |
| T-75 | Échéanciers et versements (lien par versement) ; mise à jour automatique sur paiement réussi | M |
| T-76 | Relances : calendrier J-3/J0/J+3/J+7 modifiable, préférences client, plage 8 h–19 h Africa/Brazzaville, **revérification du statut au moment de l'envoi** | M |
| T-77 | Reçus : numérotation sans trou par marchand (compteur verrouillé en transaction), PDF, envoi | M |
| T-78 | Pack École : années, classes, élèves, responsables, grilles de frais, échéancier type | L |
| T-79 | Import CSV/Excel élèves + modèle + rapport d'erreurs ; génération des échéanciers (500 élèves < 2 min) | M |
| T-80 | Tableau de bord école (impayés par classe, retardataires exportables), lien par élève, reçus au nom de l'élève | M |
| T-81 | Facturation : `plans` (prix en base), `subscriptions`, `alphapay_invoices` payées via AlphaPay lui-même, relances M7 | M |
| T-82 | Crédits : `credit_packs`, `credit_ledger` en ajout seul, solde calculé, alerte solde bas, `402 credits_insuffisants`, `/v1/credits` | M |
| T-83 | Contrôle d'accès par palier (module verrouillé visible), période de grâce → lecture seule **sans jamais bloquer les encaissements** | M |

## S8 — M12 Back-office, M13 Carte, gel (15 → 21 déc.)

| ID | Tâche | Charge |
|---|---|---|
| T-90 | `staff_users` séparés, OTP obligatoire, rôles Support/Conformité/Super-admin | M |
| T-91 | File KYB, décision motivée ; fiches marchands (palier, statut, volumes, crédits, connecteurs) ; suspension/réactivation motivée | M |
| T-92 | Gestion paliers, prix, packs de crédits | S |
| T-93 | Supervision : paiements en échec par opérateur, messages par fournisseur, webhooks en échec | M |
| T-94 | `audit_logs` en ajout seul (trigger Postgres refusant UPDATE/DELETE), intercepteur sur actions sensibles, liste couverte dans `DECISIONS.md` | M |
| T-95 | `CardAcquirer` (page hébergée partenaire) + mock complet, `FEATURE_CARD_PAYMENTS=false` par défaut, aucune trace si désactivé | M |
| T-96 | Gel des fonctionnalités | — |

## S9 — Recette et livraison (22 → 27 déc.)

| ID | Tâche | Charge |
|---|---|---|
| T-100 | Playwright : parcours 1 (inscription → KYB → QR → Vérif → reçu) et 2 (import école → relance → paiement → facture payée) | L |
| T-101 | Couverture ≥ 80 % sur paiements, OTP, crédits, recouvrement, contrôle d'accès | M |
| T-102 | Jeu de démonstration (1 commerçant, 1 école de 50 élèves, paiements, factures, relances) | M |
| T-103 | Préproduction + production décrites et déployables (VPS OVH, compose prod, TLS, sauvegarde quotidienne + restauration testée) | M |
| T-104 | Docs : `README.md`, `API.md`, `RUNBOOK.md`, `ADMIN.md`, `GO_LIVE.md` | M |
| T-105 | `pnpm audit` sans critique/haute, revue sécurité, vocabulaire §4.4 vérifié (test automatique de chaînes interdites) | S |

## Fil rouge (chaque jalon)

- i18n de toute chaîne visible ; test CI qui refuse les formulations interdites (§4.4).
- Journal d'audit sur chaque nouvelle action sensible.
- Tests d'intégration de contrôle d'accès pour chaque nouvelle route.
- Mise à jour de `PROGRESS.md` en fin de session.

## Risques

| Risque | Mitigation |
|---|---|
| Volume : 13 modules en 8 semaines | Socle mutualisé tôt (fournisseurs, file, livemode, audit) ; ordre de sacrifice §12 si glissement, validé par Miche |
| Modèle d'accès API par marchand non confirmé par MTN/Airtel | Logique isolée dans les adaptateurs (D-006) |
| Pas d'accès sandbox Airtel | Adaptateur livré sur mock + tests de contrat |
| Réécriture de l'auth (retrait de Clerk) | Fait en S2, avant que les autres modules n'en dépendent |
