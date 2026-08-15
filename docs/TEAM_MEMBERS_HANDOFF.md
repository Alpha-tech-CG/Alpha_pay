# Team Members (multi-tenant marchand) — Passation / Handoff

> Document de reprise pour continuer la feature **Settings > Team Members** avec une
> autre session Claude Code. Rédigé le 14 août 2026. Feature = permettre à plusieurs
> utilisateurs d'appartenir à un même marchand (rôles, invitations, statuts, audit).
>
> **Repo** : `D:\Alphapay` · branche `main` · remote SSH `github.com:mastefox2742/Alphapay`.
> **Backend** : NestJS + Prisma + Postgres (`apps/api`). **DB dev** : Docker `alphapay-postgres-1`, `localhost:5433`, `postgresql://postgres:postgres@localhost:5433/paybrain`.

---

## 0. Décisions verrouillées (validées par le user)

1. **Identité** : on crée une table locale **`app_users`** (miroir Clerk, alimentée par le webhook Clerk existant). `merchant_members.user_id` → FK `app_users.id`. ✅ fait (schéma).
2. **Auth des endpoints team = `1A` : `@clerk/backend` (SDK officiel)** — vérifier le token de session (Authorization Bearer) via `CLERK_SECRET_KEY`. Pas de clé API pour gérer l'équipe.
3. **Surface = `2A` : gestion d'équipe dans le DASHBOARD WEB** (déjà sous Clerk). Le **mobile RN affiche l'équipe en lecture seule** (via un endpoint list read-only) — **on n'embarque PAS Clerk dans l'app Expo**.
4. Rôles : `OWNER, ADMIN, MANAGER, MEMBER, VIEWER`. Statuts : `INVITED, ACTIVE, SUSPENDED, REMOVED`. Matrice RBAC = cf. §5.
5. Invitations par **Postmark**, validité **7 jours**, token **hashé SHA-256** (jamais en clair).
6. `merchants.owner_user_id` **cache dénormalisé** conservé (source de vérité = `merchant_members`).
7. Périmètre = **marchands uniquement** (les `Wallet` clients sont hors sujet).

---

## 1. Ce qui est FAIT (commité + vérifié)

| Commit | Contenu | Vérif |
|---|---|---|
| `003a499` | **Schéma Prisma + migrations 13/14**. Modèles `AppUser`, `MerchantMember`, `MerchantInvitation`, `MerchantMemberEvent` + `merchants.owner_user_id` + enums. | `prisma validate` OK, migrations **appliquées** sur DB dev, `tsc` apps/api propre, 267/267 tests verts |
| `1bb8b58` | **Couche RBAC** `apps/api/src/modules/team/permissions/permissions.ts` (`can` / `canActOn` / `canAssignRole`) + `permissions.spec.ts`. | 8/8 tests verts |
| `a00a989` | **Étape A — Auth Clerk + sync `app_users`**. `@clerk/backend` installé. `apps/api/src/modules/team/auth/` : `clerk-session.guard.ts` (vérifie le Bearer via `verifyToken`, charge/upsert `app_users`, pose `req.appUser`), `require-member.guard.ts` (membership ACTIVE par `:merchantId` du path uniquement, pose `req.membership`), `require-action.decorator.ts` + `require-action.guard.ts` (`@RequireAction('team:invite')` → `can()`), `team-auth.module.ts` (exporte les 3 guards, pas encore importé dans `AppModule` — aucun controller ne les utilise avant l'étape C). `apps/api/src/modules/users/users.service.ts` (`upsertFromClerk`, `findByClerkUserId`, `markDeletedByClerkUserId` — ne supprime jamais la ligne, détache juste `clerk_user_id`). Webhook Clerk existant étendu : `user.created` (déjà présent) synchronise maintenant aussi `app_users`, + nouveaux handlers `user.updated`/`user.deleted` branchés dans `clerk-webhook.controller.ts`. | `tsc` propre, 300/300 tests verts (25 nouveaux) |
| `edefcc4` | **Étape B — Services transactionnels**. `apps/api/src/modules/team/services/` : `member-events.service.ts` (audit append-only, `record(tx, …)` exige un client de transaction) ; `members.service.ts` (`list`/`changeRole`/`suspend`/`reactivate`/`remove`, `$transaction` + anti-escalade `canActOn` + garde « dernier OWNER » défensive) ; `invitations.service.ts` (`create`/`list`/`revoke`/`preview`/`accept`, token 32o aléatoire → hash SHA-256, expiration 7j, email `team.invitation` via `NotificationService`, `accept()` vérifie l'email du compte Clerk vs celui invité) ; `ownership.service.ts` (`transfer` ordonné : démet l'ancien OWNER avant de promouvoir le nouveau, re-vérifie l'OWNER actif contre la DB). `team-services.module.ts` exporte les 4 services, pas encore importé dans `AppModule` (attend l'étape C). | `tsc` propre, 339/339 tests verts (39 nouveaux) |
| `cced4cf` | **Étape C — Controllers + DTOs + module, `TeamModule` enregistré dans `AppModule`**. `team.controller.ts` (list/changeRole/suspend/reactivate/remove/events), `invitations.controller.ts` (create/list/revoke, gate `team:invite` route + `team:invite_admin` fin dans le service), `ownership.controller.ts` (transfer), `invitations-public.controller.ts` (`GET /v1/invitations/:token` public + `POST /v1/invitations/accept` Clerk seul sans membership), `team-members-readonly.controller.ts` (`GET /v1/team/members` sous `ApiKeyGuard`, décision 2A mobile). DTOs `class-validator` dans `dto/` (rôles assignables excluent OWNER). Nouvelle action RBAC `team:audit` (ADMIN min). `main.ts` : schéma Swagger `Bearer` ajouté. **Fix DI important** : `UsersModule` passé `@Global()` (comme `DatabaseModule`/`NotificationModule`) — `ClerkSessionGuard` en dépend et Nest ne le résolvait pas depuis `TeamModule` sinon ; détecté en bootant le graphe DI complet via `Test.createTestingModule({imports:[AppModule]})` (les tests unitaires instancient les classes directement et ne l'auraient pas capté — **toujours faire ce check après avoir enregistré un nouveau module dans `AppModule`**). | `tsc` propre, 351/351 tests verts (39 nouveaux), graphe DI validé |
| `50c6f5b` | **Étape D — Infra + tests e2e HTTP** (première infra e2e du repo, `apps/api/test/`). `utils/app.ts` boote le VRAI `AppModule` via `Test.createTestingModule` (donc revalide le graphe DI à chaque run — plus jamais besoin d'un script jetable). `utils/seed.ts` : fixtures réelles (merchant/app_user/membership/clé API). 3 fichiers × 27 tests contre Postgres réel (`paybrain_test`) : guards 401/403, `merchantId` body/query ignoré, anti-escalade et garde dernier-OWNER en conditions réelles, contrainte d'index partiel « 1 invitation pending » (409 réel), invite→accept avec repli `ClerkSessionGuard` (nouvel utilisateur Clerk jamais vu), transfert de propriété atomique (1 seul OWNER actif vérifié en DB après coup). Seuls `@clerk/backend` (réseau Clerk) et `NotificationService` (email) sont stubés — guards/services/DB restent réels. **Base de test créée manuellement** (`paybrain_test`, schéma cloné de la base dev via `pg_dump --schema-only`, PAS via `prisma migrate deploy` — bloqué par un bug préexistant hors sujet sur la migration 12, tâche flag séparément, cf. §10 pour la recréer). | `tsc` propre (src+e2e), 351/351 unitaires + 27/27 e2e verts |
| `f976bbb` | **Étape E (web) — Interface équipe dans le vrai dashboard**. Backend : `MembersService.listForUser(userId)` + `GET /v1/me/merchants` (`my-merchants.controller.ts`, `ClerkSessionGuard` seul — pas de `:merchantId` dans le path) ; ajouté car le dashboard n'avait aucune notion de « merchant courant » côté client. Frontend `dashboard/` (**PAS** `apps/prototype`, cf. §2 étape E) : `team/useTeamApi.js` (client Bearer via `useAuth().getToken()`), `team/permissions.js` (miroir client `can`/`canActOn`/`canAssignRole` + `invitableRoles`, UI only), `pages/Team.jsx` (liste/invite/rôle/suspend-réactive-retire/transfert/audit), `pages/InviteAccept.jsx` (route publique `/invite`, preview sans auth + accept Clerk), `AuthPages.jsx` corrigé (`fallbackRedirectUrl` au lieu de `forceRedirectUrl`, sinon Clerk écrasait `?redirect_url=` et cassait le retour vers `/invite` après connexion). Vérifié dans le navigateur (build + `node dist/main.js`, DB dev réelle) : `/invite?token=…` affiche correctement les vraies données via l'API publique, `/team` redirige vers la connexion si non authentifié. Parcours authentifié complet non testable interactivement (pas d'identifiants Clerk réels) — couvert par les tests e2e backend. | `tsc` propre, 353/353 unitaires + 30/30 e2e verts, lint dashboard propre |

**État DB dev** : les 4 tables existent, l'index unique **partiel** `merchant_members_one_active_owner` (un seul OWNER actif/marchand) et `merchant_invitations_one_pending` (une seule invitation en attente/(marchand,email)) sont créés. Backfill migration 14 : idempotent, n'a rien converti en dev (le seul marchand n'a pas de `clerk_user_id`).

Fichiers clés déjà en place :
- `packages/database/prisma/schema.prisma` (modèles + enums, tout en bas du fichier).
- `packages/database/prisma/migrations/13_team_members/migration.sql` (DDL).
- `packages/database/prisma/migrations/14_backfill_team_owners/migration.sql` (data, idempotent).
- `apps/api/src/modules/team/permissions/permissions.ts` + `.spec.ts`.

---

## 2. Ce qui RESTE À FAIRE (ordre recommandé)

### Étape A — Auth Clerk (SDK) + sync `app_users` — ✅ FAIT (`a00a989`, cf. §1)

### Étape B — Services transactionnels (+ audit) — ✅ FAIT (`edefcc4`, cf. §1)

### Étape C — Controllers + DTOs + module — ✅ FAIT (`cced4cf`, cf. §1)

### Étape D — Tests d'intégration end-to-end — ✅ FAIT (`50c6f5b`, cf. §1)

### Étape E — Frontend
- **Web dashboard — ✅ FAIT** (`f976bbb`, cf. §1). **Correction importante** : le « vrai dashboard sous Clerk » n'est PAS `apps/prototype` (ça, c'est un mockup HTML statique sans aucun appel API ni Clerk) — c'est le dossier **`dashboard/`** à la racine du repo (Vite + `@clerk/clerk-react` + React Router, port 5174, proxy `/api` → `apps/api` sur le port 3000). Si un futur agent voit à nouveau mentionner « apps/prototype » pour le dashboard, c'est une erreur à corriger dans ce document.
- **Mobile (`mobile/`)** — reste à faire ← **COMMENCER ICI** : `app/(merchant)/team.tsx` **lecture seule** branché sur `GET /v1/team/members` (auth **ApiKey**, déjà en place côté mobile — voir §4). Remplacer le bloc « Team Members » mock de `app/(merchant)/settings.tsx` par un lien vers cet écran.

### Étape F — Durcissement + contract
- Rate-limit invitations, masquage email selon rôle, revue sécurité (charte 5 niveaux), pen-test des endpoints.
- **Migration ultérieure (contract)** : retirer l'unicité `merchants.clerk_user_id` (le 1:1 Clerk↔marchand) une fois le code basculé sur `app_users`. **NE PAS** le faire avant la bascule complète (expand/contract).

---

## 3. Modèle de données (rappel)

Tables : `app_users`, `merchant_members` (source de vérité), `merchant_invitations`, `merchant_member_events`, + `merchants.owner_user_id` (cache).
Contraintes fortes :
- `merchant_members` : `UNIQUE(merchant_id,user_id)` + **index partiel** `WHERE role='OWNER' AND status='ACTIVE'` (≤ 1 owner actif).
- `merchant_invitations` : **index partiel** `UNIQUE(merchant_id,email_hash) WHERE accepted_at IS NULL AND revoked_at IS NULL`.
- PII (`email_encrypted` BYTEA + `email_hash` BYTEA) : AES-256-GCM via `apps/api/src/common/security/pii-crypto.ts` (`encryptField`/`decryptField`).
- IDs : `TEXT` (uuid généré par Prisma `@default(uuid())`). Enums Postgres **UPPERCASE**. `TIMESTAMPTZ`.

---

## 4. Endpoints (spec)

Auth utilisateur = **Clerk (Bearer)** sauf le GET mobile (ApiKey). `:merchantId` validé contre le membership.

| Méthode | Route | Rôle min | Auth |
|---|---|---|---|
| GET | `/v1/merchants/:merchantId/members` | VIEWER | Clerk (web) |
| GET | `/v1/me/merchants` (résout le/les marchand(s) du Clerk user, ajouté étape E) | — | Clerk |
| GET | `/v1/team/members` (mobile, read-only) | — | **ApiKey** (résout merchant depuis la clé) |
| POST | `/v1/merchants/:merchantId/members/invitations` | MANAGER | Clerk |
| GET | `/v1/merchants/:merchantId/members/invitations` | MANAGER | Clerk |
| DELETE | `/v1/merchants/:merchantId/members/invitations/:id` | MANAGER | Clerk |
| GET | `/v1/invitations/:token` (preview) | public (token) | — |
| POST | `/v1/invitations/accept` `{token}` | invité authentifié | Clerk |
| PATCH | `/v1/merchants/:merchantId/members/:memberId` (role) | ADMIN | Clerk |
| POST | `.../members/:memberId/suspend` \| `/reactivate` | ADMIN | Clerk |
| DELETE | `.../members/:memberId` (soft) | ADMIN | Clerk |
| POST | `/v1/merchants/:merchantId/ownership/transfer` `{toUserId}` | OWNER | Clerk |
| GET | `.../members/events` (audit) | ADMIN | Clerk |

---

## 5. RBAC (déjà codé dans `permissions.ts`)

`can(role, action)` — actions : `team:view, team:invite, team:invite_admin, team:change_role, team:suspend, team:remove, team:audit, ownership:transfer, payments:view, paylinks:write, apikeys:write, webhooks:write, payouts:request`. (`team:audit` ajouté à l'étape C pour `GET .../members/events`, ADMIN min.)
`canActOn(actor, target)` = rang acteur > rang cible. `canAssignRole(actor, newRole)` = newRole < acteur et ≠ OWNER.
Matrice : voir `docs` design + le fichier. OWNER=4 > ADMIN=3 > MANAGER=2 > MEMBER=1 > VIEWER=0.

---

## 6. Règles métier critiques (à ne pas oublier)
- **Jamais 0 owner** : bloquer suspend/remove/downgrade du dernier OWNER actif → exiger un transfert d'abord.
- **Un seul OWNER actif** : garanti par l'index partiel ; le transfert doit être **transactionnel**.
- **Tout filtré par `merchant_id`** issu du membership authentifié.
- **Soft-delete** : `status='REMOVED'` + `removed_at`, jamais de DELETE physique immédiat.
- **Transactionnel + audit** : chaque mutation sensible = 1 transaction + 1 `merchant_member_events`.
- Token invitation : hashé, expiration, usage unique, comparaison constant-time.

---

## 7. « Clés » / environnement & secrets à poser

> ⚠️ Les **valeurs réelles** ne sont pas dans ce doc (secrets). Elles vivent dans
> `apps/api/.env` (dev) et **AWS Secrets Manager** (prod, chargé par `loadSecretsFromAws`).
> Il faut les récupérer/renseigner :

| Variable | Où l'obtenir | Usage |
|---|---|---|
| `CLERK_SECRET_KEY` | Dashboard Clerk (Backend API key `sk_...`) | Vérifier les sessions (SDK `@clerk/backend`) |
| `CLERK_PUBLISHABLE_KEY` | Dashboard Clerk | Front (déjà utilisé côté admin) |
| `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks (svix) | Déjà utilisé par `ClerkWebhookGuard` |
| `POSTMARK_SERVER_TOKEN` (ou équivalent notifications) | Postmark | Envoi email d'invitation |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/paybrain` (dev) | Prisma |
| `APP_INVITE_BASE_URL` | à définir | Base du lien d'invitation `…/invite?token=` |

Vérifier `apps/api/src/secrets/` + `apps/api/.env.example` pour la liste canonique et y **ajouter** `CLERK_SECRET_KEY` + `APP_INVITE_BASE_URL`.

---

## 8. Conventions du repo & pièges (IMPORTANT pour l'autre agent)

- **Migrations** : écrites À LA MAIN (SQL) dans `packages/database/prisma/migrations/NN_nom/migration.sql` **ET** modèles ajoutés dans `schema.prisma`. Appliquer : DB up puis `cd packages/database && DATABASE_URL=… npx prisma migrate deploy`. Régénérer client : `npx prisma generate` (nécessite `DATABASE_URL` posé même pour validate/generate). Index **partiels** = SQL uniquement (Prisma ne les gère pas).
- **Enums** = UPPERCASE, types Postgres PascalCase (`"MerchantMemberRole"`).
- **Charte sécurité** (mémoire projet) : avant chaque commit backend → `npx tsc --noEmit` clean **et** `npx jest --runInBand` **100% verts** (argon2 OOM en parallèle → toujours `--runInBand`). Défense en profondeur 5 niveaux à préserver.
- **PII** : jamais en clair ; `encryptField`/`decryptField` + `email_hash` pour la recherche.
- **DB Docker** : si down, `docker compose up -d postgres` à la racine ; healthcheck `docker exec alphapay-postgres-1 pg_isready -U postgres`.
- **⚠️ PIÈGE COMMITS** : l'outil Bash est **Git Bash (POSIX)**, PAS PowerShell. **Ne pas** utiliser `git commit -m @'...'@` (syntaxe here-string PowerShell) → ça met un `@` comme sujet. Utiliser `git commit -F <fichier>` avec un fichier message.
- **Terminer les messages de commit** par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Ne pas committer** : `.tools/`, `mobile/android/`, `apps/prototype/android/` (déjà gitignorés).

---

## 9. Contexte projet (au-delà de la feature team)

- Le **produit final** est l'app mobile native Expo `mobile/` (20 écrans : client / merchant / developer), branchée sur `apps/api` en **mode LIVE + repli DEMO** (stores `mobile/src/wallet-store.tsx` et `mobile/src/merchant-store.tsx`). APK release buildable localement (JDK/SDK dans `.tools/`, `services.gradle.org` bloqué → Gradle 8.10.2 en cache).
- Endpoints wallet/merchant déjà branchés (commits `153bf0a`, `c28db52`, `2e65c10`, `3f13f67`, `b7ccf75`).
- Voir aussi `docs/PROD_READINESS.md`, `docs/ROADMAP_MODULES.md`, `docs/AVANT_PROD.md`.

---

## 10. Cheat-sheet commandes

```bash
# DB up + migrations
docker compose up -d postgres
cd packages/database && DATABASE_URL="postgresql://postgres:postgres@localhost:5433/paybrain" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/paybrain" npx prisma generate

# Backend : typecheck + tests unitaires (obligatoire avant commit)
cd apps/api && npx tsc --noEmit && npx jest --runInBand

# Backend : tests e2e (nécessite la base paybrain_test — cf. ci-dessous si absente)
cd apps/api && npm run test:e2e

# Recréer paybrain_test si absente/désynchronisée (prisma migrate deploy depuis zéro
# est CASSÉ par un bug préexistant sur la migration 12, hors sujet team — tâche flag
# séparément). Clone du schéma de la base dev via pg_dump, PAS de replay de migrations :
docker exec alphapay-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS paybrain_test;"
docker exec alphapay-postgres-1 psql -U postgres -c "CREATE DATABASE paybrain_test;"
docker exec alphapay-postgres-1 pg_dump -U postgres --schema-only -d paybrain \
  | docker exec -i alphapay-postgres-1 psql -U postgres -d paybrain_test

# Mobile : typecheck
cd mobile && npx tsc --noEmit

# Commit (via fichier, JAMAIS @'...'@)
git commit -F message.txt
```

---

## 11. Prochaine action concrète pour l'agent qui reprend
> **Étape E (mobile) ci-dessus** : dans `mobile/`, créer `app/(merchant)/team.tsx` **lecture seule**, branché sur `GET /v1/team/members` (auth **ApiKey**, déjà en place côté mobile — voir `mobile/src/merchant-store.tsx` pour le pattern d'appel API existant). Remplacer le bloc « Team Members » mock de `app/(merchant)/settings.tsx` par un lien vers cet écran. Le web (`dashboard/`) et tout le backend sont **faits et fonctionnels** (étapes A-E web) : tous les endpoints du §4 répondent, cf. `apps/api/test/team/*.e2e-spec.ts` pour des exemples de requêtes/réponses. Vérifier `cd mobile && npx tsc --noEmit`. Si l'agent touche encore `app.module.ts` ou les imports entre modules `team/*` côté backend, les tests e2e (`npm run test:e2e` dans `apps/api`) bootent déjà le vrai `AppModule` à chaque run — garde-fou permanent contre une régression DI comme celle du `UsersModule` non-`@Global()` (commit `cced4cf`). Committer. Puis Étape F (durcissement + migration contract).
