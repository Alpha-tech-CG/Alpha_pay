# Avancement — AlphaPay V1

> Mis à jour à chaque fin de session. Plan détaillé : `docs/PLAN.md`. Branche de travail : `v1`.

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
| S3 M1, M9, M3 | 16 nov. | En cours — M9 et M1 faits ; M3 à faire |
| S5 M4, M5, M10, M2 | 30 nov. | À faire |
| S7 M6, M7, M8, M11 | 14 déc. | À faire |
| S8 M12, M13, gel | 21 déc. | À faire |
| S9 Recette, livraison | 27 déc. | À faire |
