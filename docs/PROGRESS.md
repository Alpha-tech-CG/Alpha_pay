# Avancement — AlphaPay V1

> Mis à jour à chaque fin de session. Plan détaillé : `docs/PLAN.md`. Branche de travail : `v1`.

## Session du 28 octobre 2026 (11) — M6 Gérer (S6 partiel)

### Fait
- **T-70** Transactions filtrées (`date_from`, `date_to`, `operator`, `q`), sommaire marchand (aujourd'hui + historique), détail avec piste d'audit — migration 0 (pas de schéma nouveau). Endpoint `GET /v1/merchants/:id/stats` (indicateurs jour/semaine/mois, répartition opérateur, taux d'échec).
- **T-71** Cash déclaré : migration 30, table `cash_entries`, endpoint CRUD avec RBAC (`cash:declare` pour caissier, admin/owner voient tout).
- **T-72** Rapprochement journalier : migration 31, table `reconciliation_days` avec indices partiels (raw SQL), endpoints `GET /` `GET /:date` `PATCH /:date` `POST /:date/import-csv` (réutilise `parseStatementCsv`), upsert via findFirst+create/update.
- **T-73** Exports CSV/Excel : migration 32, table `export_jobs`, BullMQ worker (jusqu'à 10 000 lignes), génération CSV (BOM UTF-8) et XLSX (ExcelJS), stockage via `FileStorage`, lien de téléchargement 1 h. Endpoints `POST` / `GET` / `GET /:jobId`.
- **T-74/75/76/77** Recouvrer : migration 33 (customers, invoices, invoice_lines, invoice_installments, invoice_reminders, receipts). Numérotation sans trou (compteur transactionnel), versements avec vérif somme=total, relances J-3/J0/J+3/J+7 dans la plage 8h-19h Africa/Brazzaville, reçus REC-YYYY-NNNNN, PDF HTML.
- **T-78/79/80** Pack École : migration 34 (school_years, school_classes, students, guardians, fee_grids, fee_grid_lines, student_fee_schedules). Import CSV avec rapport d'erreurs, application de grille (génère factures), tableau de bord impayés/retardataires par classe.
- **T-81/82/83** Facturation/Crédits/Palier : migration 35 (billing_plans, subscriptions, alphapay_invoices, credit_packs). `BillingService` : abonnement TRIAL→ACTIVE→GRACE, crédits avec solde calculé (registre append-only), débit avec `402 credits_insuffisants`, contrôle par module (verrouillé visible, GRACE = lecture seule, encaissements jamais bloqués).

### Vérifié
- `tsc --noEmit` propre sur `apps/api` après T-70→T-83.

### Reste
- Migrations 30–35 à appliquer en base locale avant de tester manuellement.
- S8 (T-90→T-96) et S9 (T-100→T-105) — prochaines sessions.

## Session du 28 octobre 2026 (10) — M2 KYB et KYC (S5 terminé)

### Fait
- **T-59** Dossier KYB (migration 29, réversible ; tables Smile ID retirées) : informations de l'entreprise et du dirigeant, trois pièces (extrait RCCM, attestation NIU, pièce du dirigeant) chiffrées par l'API et lisibles uniquement par URL signée de 5 minutes, états du cahier avec historique horodaté et attribué, notification au marchand à chaque changement, mode live ouvert seulement à l'approbation.
- **T-60** `KycProvider` Sumsub (requêtes signées, webhook vérifié, résultat relu) + mock avec page factice ; faux serveur Sumsub et suite de contrat.
- Back-office : file des dossiers, pièces, résultat KYC, décision motivée (approuver, compléments, refuser ; dérogation motivée si KYC non approuvé). Écran « Dossiers KYB » du back-office réécrit.
- Tableau de bord : écran « Dossier entreprise » (formulaire, dépôt des pièces, vérification d'identité, soumission, motif, historique) et bandeau « mode test » tant que le dossier n'est pas approuvé.
- Anciens modules `kyc` (Smile ID) et `onboarding` supprimés. Décision D-051.

### Vérifié
- Unitaires 297 (les tests Smile ID et onboarding sont partis avec leurs modules), intégration 76, providers 118 — verts. Acceptation M2 couverte : ni clé `ap_live_` ni paiement live sans dossier approuvé (refus côté API) ; le back-office voit les pièces et le KYC, approuve, refuse ou demande des compléments avec motif.
- Navigateur, sur la pile reconstruite : dossier rempli dans le tableau de bord, trois pièces déposées, vérification d'identité par la page factice (« approuvé »), soumission ; dans le back-office, pièce ouverte par lien signé (PDF déchiffré), approbation, historique avec l'agent ; trois emails reçus dans MailHog (soumis, en revue, approuvé).
- Défauts trouvés et corrigés : le dossier de stockage du conteneur API n'était pas inscriptible par l'utilisateur `nestjs` (créé dans le Dockerfile) ; les tests d'intégration visent désormais `127.0.0.1` (Docker Desktop cessait de répondre sur `::1`).

### Reste / points connus
- Contrat Sumsub (dépendance §13) : chemins de l'API à valider sur compte réel ; en attendant, KYC factice et dérogation motivée dans le back-office.
- Back-office encore sous Clerk avec identité de l'agent déclarative (`X-Staff-Id`) jusqu'aux comptes du personnel (T-90).
- `docs/ADMIN.md` (guide du back-office) à rédiger avec M12.

## Session du 28 octobre 2026 (9) — M10 Développeurs

### Fait
- **T-56** Clés `ap_test_`/`ap_live_` gérées depuis le tableau de bord (secret affiché une seule fois, remplacement, révocation, audit) ; limite par clé avec en-têtes `RateLimit-*` ; journal des requêtes API sur 30 jours (migration 28, réversible).
- **T-57** Webhooks signés `AlphaPay-Signature`, enveloppe d'événement standard (corrige l'envoi d'un montant BigInt non sérialisable), nouvelles tentatives sur 24 h, journal des livraisons et bouton « Renvoyer », événements `message.delivered`/`message.failed`, URL live publique obligatoire.
- **T-58** Portail développeurs FR sur `/docs` (guide : démarrage, authentification, numéros de test, paiements, liens, idempotence, webhooks et vérification de signature en Node et PHP, messages et OTP, erreurs, limites) + référence OpenAPI 3.1 avec exemples générés ; export versionné `docs/api/openapi.json`. Ancien guide PayBrain archivé (il décrivait des remboursements, hors périmètre).
- Page **Développeurs** du tableau de bord réécrite sur la session (plus de clé API dans le proxy).
- Décisions D-049, D-050.

### Vérifié
- Unitaires 311, intégration 70, providers 113 — verts (dont : clé affichée une fois, live refusé sans KYB, caissier refusé, journal sans donnée personnelle, `RateLimit-*` et 429, webhook signé vérifié, relance après panne, renvoi manuel, `message.failed`, URL live non publique refusée).
- Navigateur, sur l'image reconstruite : portail `/docs` (guide FR + référence) ; page Développeurs : clé créée et affichée une seule fois, deux appels avec cette clé visibles dans le journal (route normalisée, `404 · paiement_introuvable`).
- Défauts trouvés et corrigés : la CSP stricte bloquait le portail (CSP dédiée à `/docs`) ; un échec de création de webhook pouvait remonter dans la transition de statut (isolé).

### Reste / points connus
- Écran Paiements du tableau de bord encore sur l'ancien proxy à clé API (refait avec M6).
- Le DNS de la box (filtre RPZ) résout `truststore.pki.rds.amazonaws.com` en 127.0.0.2 : une construction Docker sans cache de l'API peut échouer sur le téléchargement du certificat RDS (inutile depuis le départ d'AWS, à retirer du Dockerfile).

## Session du 28 octobre 2026 (8) — M5 Vérif

### Fait
- **T-55** Vérif (migration 27, réversible : abonnements web push) : confirmation à chaque paiement réussi au propriétaire et aux caissiers de la caisse — flux temps réel SSE (ticket à usage unique, Redis pub/sub entre worker et API), web push VAPID (adaptateur réel + factice dans `packages/providers`), SMS/WhatsApp en option par caisse.
- Écran **Caisse** du tableau de bord : gros affichage du dernier paiement, paiements et total du jour en direct, activation des notifications, mention de la limite « paiements hors AlphaPay invisibles ». Tableau de bord installable (PWA : manifeste, service worker).
- Décision D-048.

### Vérifié
- Unitaires 310, intégration 64, providers 113 — verts. Acceptation M5 couverte : confirmation reçue en moins de 5 s, aucune confirmation sur un paiement échoué, caissier limité à sa caisse.
- Navigateur, sur l'image Docker reconstruite : paiement par QR de caisse → l'écran Caisse ouvert affiche « 15 000 XAF » sans rechargement (worker → Redis → SSE → tableau de bord).

### Reste / points connus
- Clés VAPID de production à générer (`.env.example`) ; notifications non testées sur téléphone réel (le navigateur intégré les bloque).
- Modèle WhatsApp `alphapay_paiement_recu` à faire approuver chez Meta (déjà listé).

## Session du 27-28 octobre 2026 (7) — M4 Encaisser

### Fait
- **T-50** Boutiques, caisses (code public, options Vérif), caissiers rattachés (migration 25, réversible) ; liste des paiements du tableau de bord cloisonnée par caisse.
- **T-51/T-61** API publique `/v1/payments` (création, lecture, liste par curseur), clé en `Authorization: Bearer`, `Idempotency-Key` obligatoire, verrou live sans KYB (paiements et clés live). SDK migré.
- **T-52** Liens de paiement (migration 26, réversible) : montant fixe ou libre, expiration, usage unique ou multiple, désactivation, partage WhatsApp/SMS (URLs prêtes et envoi direct) ; ancien module `/paylinks` supprimé.
- **T-53** Page de paiement hébergée servie par l'API (`/l/<code>`, `/c/<code>`), ~10 Ko sans framework, suivi du statut par jeton signé.
- **T-54** QR de caisse en PDF A5/A6 (QR vectoriel, nom du marchand, opérateurs acceptés).
- Décisions D-044 à D-047.

### Vérifié
- Tests d'intégration HTTP : cloisonnement caissier (acceptation M1), idempotence, verrou KYB, liens expirés/désactivés/déjà payés sans appel opérateur (acceptation M4), page < 200 Ko, PDF A5/A6.
- Image Docker reconstruite, migration 26 appliquée par le compose. Navigateur (format téléphone) : QR de caisse → montant, numéro, MTN prérempli → « Validez sur votre téléphone » → « Paiement réussi » via les relances du vrai worker ; page de lien à montant libre.

### Reste / points connus
- Logos officiels MTN et Airtel à fournir (`apps/api/assets/operators/`).
- Écrans du tableau de bord (Paiements, liens, boutiques et caisses, impression du QR) : à refaire avec M6 sur les nouvelles routes ; l'ancien écran « Checkout » du tableau de bord devient inutile.
- Critère « un caissier encaisse depuis le QR en moins de 30 s » : à chronométrer en recette sur téléphone réel.

## Session du 27 octobre 2026 (6) — M3 Connecteurs (S3 terminé)

### Fait
- **T-44** Statuts unifiés (migration 24, réversible) : en_attente, réussi, échoué, expiré, annulé ; machine d'état ; relance qui expire les paiements sans réponse (`payment.expired`) ; libellés publics dans l'API et les webhooks.
- **T-44** Callbacks opérateur par URL secrète propre à chaque connexion marchand (D-041).
- **T-40** API des comptes opérateur (connexion, vérification réelle, déconnexion, URL de notification) + page « Comptes opérateur » du tableau de bord avec guide pas à pas.
- **T-41 à T-43** déjà livrés avec T-05/T-06 (adaptateurs MTN, Airtel, mock) ; `verifyCredentials` ajouté à la suite de contrat.
- Décisions D-041 à D-043.

### Vérifié
- Unitaires 308, intégration 38, providers 105 — verts.
- Navigateur : session restaurée par le cookie après rechargement ; connexion MTN avec identifiants factices refusée par le vrai sandbox MTN → « En attente de connexion », motif clair, URL de notification.

### Critères d'acceptation M3
- « Paiement test MTN et Airtel de bout en bout en sandbox avec webhook reçu » : prêt côté code (connexion sandbox + `MOBILE_MONEY_TEST_PROVIDER=sandbox`), **à exécuter avec de vrais identifiants sandbox** (MTN disponible, Airtel en attente d'accès).
- « Couper le réseau ne crée ni doublon ni paiement bloqué » : couvert (identifiant dérivé de la référence, 409 = déjà acceptée, outbox, relance jusqu'à expiration).
- « Un troisième opérateur = un nouvel adaptateur » : couvert (fabrique + valeur d'enum).

## Session du 27 octobre 2026 (5) — M1 Comptes

### Fait
- **T-30** Migration 23 (testée dans les deux sens) : comptes maison, sessions, rôles du cahier des charges, invitations par téléphone, `audit_logs` en ajout seul ; colonnes Clerk supprimées.
- **T-31** `/v1/auth` : inscription, connexion mot de passe puis code (SMS, WhatsApp, email), refresh par cookie + anti-CSRF, déconnexion (une/toutes), sessions, mot de passe oublié sans énumération, `me`.
- **T-32/T-33** Matrice des rôles §M1, anti-escalade, invitations via M9, révocation immédiate des sessions d'un membre suspendu ou retiré, audit des actions sensibles.
- **Retrait de Clerk** de l'API (modules clerk/users, inscription héritée) et du tableau de bord (écrans maison, i18n FR/EN).
- **T-34** 13 tests d'intégration HTTP sur Postgres réel.
- Décisions D-036 à D-040.

### Vérifié
- Unitaires 304, intégration 33 — verts.
- Navigateur : inscription, connexion avec code WhatsApp, accès au tableau de bord.

### Reste
- Isolement du caissier par caisse : testé avec T-50 (caisses).
- Back-office encore sous Clerk jusqu'à T-90 (D-039).
- Pages Paiements et Développeurs du tableau de bord encore sur la clé API du proxy (M4, M6, M10).

## Session du 27 octobre 2026 (4) — M9 Messages et OTP

### Fait
- **Image Docker** constructible (quarantaine pnpm neutralisée pour la seule étape `deploy`, autorisé par Miche) ; `docker compose up` vérifié de bout en bout sur volumes neufs.
- **T-20** Schéma : modèles versionnés, messages (destination hachée/masquée, contact et variables chiffrés puis effacés), préférences, désabonnements, audit OTP, registre de crédits en ajout seul (triggers Postgres). Migration 22 testée (triggers, aller-retour).
- **T-21** Service d'envoi : file BullMQ, nouvelles tentatives, bascule de canal (y compris sur accusé d'échec tardif), accusés de livraison, STOP, crédits (402 avant tout envoi, débit sérialisé, remboursement), boîte d'envoi de dev `GET /dev/outbox`.
- **T-22** Adaptateurs réels Infobip, Meta WhatsApp Cloud API (modèle Authentification), SMTP ; MailHog branché dans le compose.
- **T-23** OTP conforme §M9 + API revendue `/v1/messages`, `/v1/otp/send`, `/v1/otp/verify`, `/v1/credits`.
- **T-24** Tests d'intégration sur Postgres réel (ajoutés à la CI) : les deux critères d'acceptation de M9 et celui des 5 OTP faux de M1 sont couverts.
- Décisions D-030 à D-035.

### Vérifié
- Unitaires `apps/api` 342, `providers` 100, `shared` 23 ; intégration 20 — verts.
- Smoke test sur la pile locale (worker BullMQ réel) : OTP WhatsApp avec bascule SMS, délai de 60 s, code lié à l'usage, usage unique, `/v1/messages` puis statut, `/v1/credits`, aucun code dans les journaux.
- Même smoke test dans les conteneurs (`docker compose`, image reconstruite avec M9) ; OTP par email reçu dans MailHog via l'adaptateur SMTP réel.
- Deux défauts trouvés par les tests et corrigés : lecture d'un statut de message sans marchand (exposait les messages internes), contenu OTP chiffré conservé au-delà de son expiration.

### Reste / points connus
- L'ancien module `notifications` (Africa's Talking, Postmark) sert encore l'onboarding, Clerk et le rapprochement : ses appelants passeront sur M9 avec leur réécriture (M1, M2, M6), puis il sera supprimé.
- Les modèles WhatsApp (`alphapay_otp`, `alphapay_paiement_recu`, `alphapay_notification`) doivent être soumis et approuvés chez Meta (dépendance §13).
- Infobip et Meta : formats à valider sur comptes réels (D-032).

### Prochaine étape
M1 Comptes (T-30 à T-34) : authentification maison mot de passe + OTP (s'appuie sur `OtpService`), sessions révocables, rôles marchand, retrait de Clerk.

## Session du 27 octobre 2026 (3) — fin du socle S1

### Fait
- **T-06** Registre de fournisseurs : table `provider_connections` (identifiants opérateur **du marchand**, chiffrés sous une clé dédiée), live = connexion production obligatoire (422 `operateur_non_connecte`), test = mock ou sandbox ; jetons opérateur en cache Redis ; `packages/connectors` supprimé.
- **T-07** File BullMQ + worker séparé (`pnpm worker`) ; relance du statut des paiements à 5 s, 10 s, 20 s, 40 s puis 60 s jusqu'au statut final ou à l'expiration.
- **T-08** Format d'erreur unique §7, journaux JSON pino (`request_id`, trace OpenTelemetry, PII masquées), `/health` et `/ready`.
- **T-09** Montants en unités mineures ISO 4217 (XAF = francs entiers), `15 000 XAF` ; migration 20 corrige les montants XAF existants.
- **T-10** Téléphones E.164 (+242 0…) et préfixes opérateurs en configuration.
- **T-11** Séparation test/live : colonnes `livemode`, garde Prisma qui refuse toute liste sans mode.
- **T-12** `docker-compose.yml` : Postgres, Redis, MailHog, migrations, API, worker, tableau de bord, back-office, mocks par défaut.
- **T-13** CI : tests avec Postgres et Redis, migrations sur base vierge, audit des dépendances (non bloquant).
- **T-14** `.env.example` complet ; l'API et le worker refusent de démarrer avec une configuration invalide.

### Vérifié en conditions réelles (Postgres et Redis Docker, API et worker lancés sur la machine)
- Les 22 migrations s'appliquent sur une base vierge ; les `down.sql` 18 à 21 annulent puis rejouent sans erreur.
- `/ready` → base et Redis OK ; erreur de validation au format §7 ; rejeu `Idempotency-Key` (`Idempotency-Replayed: true`).
- Paiement de bout en bout avec l'opérateur factice (`+242060000003`) : `PENDING` → `SUCCESSFUL` par les relances du worker, montant stocké 15 000 XAF.
- Journaux : JSON, `request_id` et `trace_id`, aucun numéro ni clé API en clair.
- Deux bogues trouvés et corrigés : `WebhooksService` non exporté (l'API ne démarrait pas — nouveau test `app.module.spec.ts` qui compile tout le graphe) et une chaîne cassée dans le seed (introduite au T-03).
- Tests : `apps/api` 336, `providers` 86, `shared` 23 — verts.

### Bloqué / en attente de Miche
- D-006 : modèle d'accès API par marchand, à confirmer avec MTN et Airtel.
- D-022 : chemins Airtel et environnement de production MTN Congo, à valider dès réception des accès.

### Image Docker et `docker compose up` (résolu le 27 oct., autorisé par Miche)
- La quarantaine `minimumReleaseAge` est neutralisée pour la seule étape `pnpm deploy` du Dockerfile (lockfile déjà vérifié).
- `docker compose up` sur volumes neufs : migrations appliquées, API saine, worker sain, `/ready` vert, tableau de bord et back-office joignables (proxy vers l'API), paiement factice Airtel de bout en bout `PENDING` → `SUCCESSFUL`.

### Points connus, traités plus tard
- Les callbacks MTN réels ne sont pas signés : le garde HMAC actuel les refuse. Sans conséquence grâce aux relances (D-021) ; à revoir avec T-44 (URL de callback avec jeton par marchand).
- `GET /payments/:ref` renvoie encore des champs internes (numéro chiffré) : réécrit avec l'API `/v1/payments` (T-51).
- Les fronts nécessitent encore une clé Clerk jusqu'à T-30.

### Prochaine étape
S2–S3 : M9 Messages et OTP (T-20 à T-24), puis M1 Comptes (T-30 à T-34, retrait de Clerk), puis M3 (T-40 à T-44 : statuts unifiés, guide de connexion opérateur).

## Sessions précédentes (27 octobre 2026)
- (2) T-02 à T-05 : nettoyage, retrait du code détenant des fonds, gel des apps hors périmètre, paquet `providers`.
- (1) Audit, plan, décisions D-001 à D-018.

## Tableau de bord des jalons

| Jalon | Échéance | État |
|---|---|---|
| S1 Socle | 2 nov. | **Fait** (T-01 à T-14) |
| S3 M1, M9, M3 | 16 nov. | **Fait** (sauf essais sandbox réels MTN/Airtel) |
| S5 M4, M5, M10, M2 | 30 nov. | **Fait** |
| S7 M6, M7, M8, M11 | 14 déc. | À faire |
| S8 M12, M13, gel | 21 déc. | À faire |
| S9 Recette, livraison | 27 déc. | À faire |
