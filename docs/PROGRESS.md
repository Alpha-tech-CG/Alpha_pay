# Avancement — AlphaPay V1

> Mis à jour à chaque fin de session. Plan détaillé : `docs/PLAN.md`. Branche de travail : `v1`.

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
- **Image Docker de l'API** : l'étape `pnpm deploy` échoue (`ERR_PNPM_MISSING_TIME` sur `magic-string`, dépendance de `@nestjs/cli`) à cause de la quarantaine `minimumReleaseAge`. Correctif proposé : la neutraliser pour cette seule étape (`--config.minimum-release-age=0`), le lockfile étant déjà vérifié. Modification refusée par le garde-fou de sécurité de la session : **décision de Miche requise**. En attendant, `docker compose up` ne démarre pas `migrate`, `api` ni `worker`.
- D-006 : modèle d'accès API par marchand, à confirmer avec MTN et Airtel.
- D-022 : chemins Airtel et environnement de production MTN Congo, à valider dès réception des accès.

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
| S1 Socle | 2 nov. | **Fait** (T-01 à T-14), sauf image Docker de l'API (en attente de décision) |
| S3 M1, M9, M3 | 16 nov. | À faire |
| S5 M4, M5, M10, M2 | 30 nov. | À faire |
| S7 M6, M7, M8, M11 | 14 déc. | À faire |
| S8 M12, M13, gel | 21 déc. | À faire |
| S9 Recette, livraison | 27 déc. | À faire |
