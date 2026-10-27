# Audit du dépôt — AlphaPay V1

> Date : 27 octobre 2026. Référence : `CAHIER_DES_CHARGES_ALPHAPAY_V1.md` (source de vérité).
> Méthode : lecture de la structure, du schéma Prisma, des modules `apps/api`, des connecteurs,
> des fronts et de l'infra ; exécution de la suite de tests `apps/api` (68 suites, 405 tests, **verts**).

---

## 1. Vue d'ensemble

Monorepo **pnpm 11 + Turborepo**, Node 22, TypeScript. Historique : 142 commits, projet démarré
sous le nom « PayBrain », pivoté plusieurs fois (wallet grand public → orchestrateur → V1 actuelle).

| Dossier | Nature | Verdict V1 |
|---|---|---|
| `apps/api` | **NestJS 11 (sur Express) + Prisma 6 + PostgreSQL + Redis**. Seul backend déployé. ~12 200 lignes, 25 modules. | **Socle V1** — garder, nettoyer, étendre |
| `packages/database` | Schéma Prisma (1 063 lignes, ~45 modèles), 18 migrations, seed | Garder, faire évoluer |
| `packages/connectors` | Connecteurs MTN, Airtel, CinetPay (axios) | Réécrire derrière l'interface `MobileMoneyProvider` |
| `packages/shared` | Types, normalisation téléphone, devises, chiffrement PII | Garder, compléter |
| `packages/sdk` | SDK client minimal | Garder, réaligner sur `/v1` |
| `dashboard/` | **React + Vite (JS)**, auth Clerk, i18n maison, pages Accueil/Paiements/Développeurs/Équipe/Onboarding | **Base du tableau de bord PWA** — à étendre fortement |
| `admin/` | React + Vite (JS), back-office KYC/réconciliation/règlements/wallet | Base du back-office M12 — à réorienter |
| `apps/checkout` | Next.js, page `/pay/[id]` | Base de la page de paiement hébergée M4 — à alléger (< 200 Ko) |
| `apps/marketing` | Site vitrine Next.js + next-intl | Hors périmètre V1 (conserver tel quel, corriger le vocabulaire 4.4) |
| `apps/alphapay-backend` | Second backend NestJS + **TypeORM** + BullMQ (cartes, remittance, Libye) | **Hors périmètre**, non déployé — geler |
| `apps/prototype` | Next.js + Capacitor (prototype) | Hors périmètre — geler |
| `mobile/` | App Expo native (client, caissier, marchand, développeur) | **Exclu en V1** (apps natives) — geler, ne plus y investir |
| `paybrain/`, `src/`, `securite/`, `tmp/`, `*.zip`, `api8.log` | Résidus (docs, maquettes, archives, logs) | Nettoyer (hors Git ou supprimer) |
| `terraform/` | Infra AWS (ECS, RDS, ElastiCache, WAF) | Remplacée par le VPS OVH (décision du 5 oct.) — conserver, ne pas détruire |
| `infra/` | Prometheus, Grafana, Loki, Tempo, Alertmanager, `vps/` | Garder (observabilité), simplifier |

**Constat majeur :** le cahier des charges décrit la stack comme « Node.js + Express, React + Vite ».
Le backend réel est **NestJS sur Express** avec Prisma. C'est compatible avec l'esprit du document
et le réécrire n'apporterait rien ; on garde NestJS (voir `DECISIONS.md`, D-001).

---

## 2. Ce qui existe et est réutilisable

### 2.1 Socle technique (`apps/api`)
- **Sécurité** : Helmet, CORS strict, garde de taille de corps, chiffrement PII AES-256-GCM
  (`common/security/pii-crypto.ts`) + haché déterministe pour la recherche, HMAC en temps constant,
  liste blanche d'IP, limitation de débit **adossée à Redis** (`redis-rate-limit.store.ts`).
- **Clés API** : génération, haché du secret seul, préfixe, portée (scopes), révocation,
  dernière utilisation, mode `TEST`/`LIVE` (`common/security/api-key.ts`, `api-keys` module).
- **Idempotence** : intercepteur `Idempotency-Key` avec table `idempotency_records`
  (verrou, haché de la requête, réponse rejouée, expiration) — **conforme à l'esprit de §7**.
- **Filtre d'erreurs global** (`all-exceptions.filter.ts`) — à adapter au format `{ error: { code, message, param } }`.
- **Crons multi-instance** (`CronLockService`, verrou consultatif Postgres).
- **Webhooks sortants** : endpoints, événements, secret par endpoint, signature HMAC-SHA256 +
  horodatage, journal des livraisons, worker de relance. En-tête actuel `X-Signature-256` → à renommer.
- **Webhooks entrants opérateurs** : garde HMAC, traitement idempotent (`webhook_inbound_events`).
- **Outbox** transactionnel pour les événements de paiement.
- **Observabilité** : Sentry, OpenTelemetry, Prometheus (`prom-client`), point `/stats/health`.
- **Documentation** : Swagger/OpenAPI + Scalar déjà branchés.
- **Stockage fichiers** : client S3 + URL pré-signées (`common/storage`), documents KYC chiffrés.
- **Équipe** (migrations 13/14) : `app_users`, `merchant_members`, `merchant_invitations`,
  `merchant_member_events`, RBAC par permissions, garde « membre actif », transfert de propriété.
- **KYC marchand** : `kyc_cases`, `kyc_documents`, `kyc_events`, revue admin, webhook fournisseur
  (adaptateur **Smile ID**, pas Sumsub).
- **Notifications** : SMS / email via fournisseurs, modèles, préférences, webhook de statut.
- **Réconciliation** : runs, écarts, **parseur de relevé CSV** (`statement-parser.ts`) — réutilisable pour M6.
- **Liens de paiement** (`paylinks`) : montant, description, expiration, usage unique, code USSD.
- **Tests** : 405 tests unitaires verts, config e2e présente (`test/jest-e2e.json`).

### 2.2 Connecteurs (`packages/connectors`)
- **MTN MoMo** : jeton, `requestToPay`, lecture de statut, retry ; testé en sandbox (réponse 202).
- **Airtel Money** : implémentation écrite, testée unitairement, jamais sur un vrai sandbox.
- **CinetPay** : agrégateur — hors périmètre (l'argent transiterait par un tiers non marchand).

### 2.3 Fronts
- `dashboard/` : layout, auth (Clerk), i18n maison (`i18n.jsx`), pages de base, gestion d'équipe.
- `admin/` : RBAC côté interface, déconnexion sur inactivité, pages KYC et recherche.
- `apps/checkout` : page de paiement par lien (`/pay/[id]`), route API proxy.

### 2.4 CI / livraison
- GitHub Actions : Gitleaks, lint (`tsc --noEmit`), build, tests avec service Postgres ; déploiement manuel.
- `docker-compose.yml` : Postgres 17 + Redis 7 + pile d'observabilité. **Pas** d'API, front ni worker.
- `Dockerfile` pour `apps/api`.

---

## 3. Ce qui viole la contrainte fondatrice (à retirer)

Le dépôt contient beaucoup de code issu des pivots « wallet » et « orchestrateur », où AlphaPay
**détient ou fait transiter des fonds**. C'est explicitement exclu (§1, §3.2).

| Élément | Où | Action |
|---|---|---|
| Portefeuille client (cash-in/out, P2P, plafonds, KYC wallet, float) | module `wallet`, modèles `Wallet*`, migrations 06–12, 15 | Retirer de la V1 |
| Grand livre interne (comptes, écritures, snapshots) | module `ledger`, `LedgerAccount`, `JournalEntry` | Retirer |
| Reversements / règlements (payouts, disbursement MTN) | module `settlement`, `payout-provider`, `Settlement*`, méthodes `disburse` du connecteur MTN | Retirer |
| Commission prélevée sur les paiements | module `fees`, `FeeProfile`, `Transaction.feeCents` | Retirer (la facturation M11 est séparée) |
| Routage vers partenaires / banque sponsor | modules `partners`, `routing`, `Partner*`, `RoutingRule` | Retirer ; la notion de connexion devient **par marchand** (`provider_connections`) |
| Change de devises | module `currency`, `CurrencyRate` | Retirer (XAF uniquement en prod) |
| USSD wallet | module `ussd` | Hors périmètre V1 (pas listé) — retirer du chargement |
| Identifiants opérateur **plateforme** (env `MTN_*`) | `createMtnConnector()` | Remplacer par identifiants **du marchand**, chiffrés |
| Vocabulaire « wallet », « solde », « reversement » | dashboard, admin, marketing, docs | Corriger (§4.4) |

Retrait = désenregistrement des modules dans `AppModule`, suppression du code et migration de
suppression des tables (les données de démo n'ont pas de valeur ; l'historique reste dans Git).

---

## 4. Écarts majeurs avec le cahier des charges

| Sujet | Existant | Exigé | Impact |
|---|---|---|---|
| **Authentification** | Clerk (SaaS) pour le tableau de bord ; JWT PIN pour le wallet | Auth maison : Argon2id, mot de passe + OTP (SMS/WhatsApp/email), jetons courts + refresh révocable | **Réécriture** M1 |
| **Rôles** | OWNER/ADMIN/MANAGER/MEMBER/VIEWER | Propriétaire/Administrateur/Comptable/Caissier/Développeur + cloisonnement par caisse | Migration d'enum + RBAC |
| **Boutiques / caisses** | Absent | `stores`, `tills`, `till_members` | Nouveau |
| **Mode test / live** | `ApiKeyMode` sur les clés seulement | Colonne `livemode` sur toutes les tables métier, filtrée partout | Transverse |
| **Montants** | `BigInt` en « centimes » (`toCents` ×100) y compris en XAF | XAF en entiers sans centimes ; EUR sandbox en centimes | Migration de données + `money.ts` |
| **Statuts de paiement** | PENDING/SUCCESSFUL/FAILED/REJECTED | en_attente/réussi/échoué/expiré/annulé (+ tâche de relance avec expiration) | Enum + state machine |
| **Interface fournisseur** | Classes concrètes, pas d'interface commune ni de **mock** | `MobileMoneyProvider` + adaptateurs réel et mock, tests de contrat | Réécriture connecteurs |
| **Cache jetons opérateur** | En mémoire du process | Redis jusqu'à expiration | Petit |
| **File de tâches** | Crons `@nestjs/schedule` + outbox | File Redis avec retry + file des échecs (BullMQ) | Nouveau socle |
| **Préfixes de clés** | `pk_test_` / `pk_live_` | `ap_test_` / `ap_live_` | Petit (+ compat transitoire inutile : pas de clients) |
| **Signature webhook** | `X-Signature-256` + `X-Timestamp` | `AlphaPay-Signature` avec horodatage ; retries 24 h | Petit |
| **Format d'erreur** | Format Nest par défaut | `{ error: { code, message, param } }` + codes HTTP §7 | Moyen |
| **Pagination** | Offset/aucune | Curseur | Moyen |
| **KYC** | Smile ID | Sumsub + mock ; KYB interne avec états brouillon→soumis→en_revue→… | Réécriture partielle |
| **OTP** | OTP wallet en base | OTP Redis haché HMAC, lié à (destination, usage), 5 essais, blocage 15 min, anti-pumping | Nouveau service |
| **Messages** | SMS/email directs | Service avec modèles versionnés, retries, bascule de canal, journal masqué, crédits, WhatsApp Cloud API | Extension forte |
| **WhatsApp** | Absent | Meta Cloud API | Nouveau |
| **QR caisse PDF A5/A6** | QR signé wallet | QR par boutique/caisse → page hébergée | Nouveau |
| **Vérif (web push)** | WebSocket existant (`webhooks.gateway`) | Web push PWA < 5 s + écran Caisse | Nouveau |
| **Recouvrement, Pack École, Facturation** | Absents | M7, M8, M11 | Nouveaux |
| **Journal d'audit** | Événements partiels (KYC, équipe, transactions) | `audit_logs` non modifiable sur toutes les actions sensibles | Nouveau, transverse |
| **Carte** | Absent dans `apps/api` | Interface `CardAcquirer` + mock, désactivée | Nouveau |
| **Santé** | `/stats/health` | `/health` et `/ready` (DB + Redis) | Petit |
| **docker-compose** | Postgres + Redis + observabilité | API + front + DB + Redis + worker en une commande, mocks par défaut | Moyen |
| **PWA / mobile d'abord** | Dashboard desktop | PWA installable, écrans caissier/propriétaire mobiles | Moyen |
| **i18n** | Partielle (dashboard) | Toutes les chaînes, tous les fronts | Transverse |
| **E2E Playwright** | Absent | 2 parcours | Nouveau |
| **Environnements** | AWS Terraform (abandonné), VPS en cours | Préproduction + production décrits et déployables | Moyen |

---

## 5. Dette technique

1. **Deux backends** (`apps/api` Prisma, `apps/alphapay-backend` TypeORM) aux responsabilités qui se chevauchent.
2. **Connecteurs instanciés au chargement du service** avec la config d'environnement (`createMtnConnector()` dans `PaymentsService`) : non testable, mono-compte.
3. **Idempotence de paiement double** : par `externalId` dans le service et par `Idempotency-Key` dans l'intercepteur — à unifier.
4. **Champs nommés d'après MTN** (`Transaction.mtnReferenceId`) alors que plusieurs opérateurs existent → `providerRef`.
5. **Fronts en JavaScript** (`dashboard/`, `admin/`) sans types ni tests ; `package-lock.json` npm résiduels dans un monorepo pnpm.
6. **Fuites de handles dans Jest** (« worker failed to exit gracefully ») — timers non `unref()`.
7. **Fichiers lourds ou parasites versionnés ou présents** à la racine : `gstack-main.zip` (14 Mo), 4 archives `stitch_*.zip`, `api8.log`, `terraform/plan.out`, logs de build mobile.
8. **Vocabulaire hérité** (PayBrain, wallet, solde) dans le code, les fronts et la doc.
9. **Docs nombreuses et parfois contradictoires** (`ROADMAP_MODULES.md`, `PROD_READINESS.md`, `GO_LIVE_CHECKLIST.md`…) : le cahier des charges les remplace ; à archiver dans `docs/archive/`.
10. **Pas de séparation test/live** dans les données ; tous les paiements partagent le même espace.
11. **Pas de file de tâches** dans le backend déployé : relances opérateur et webhooks reposent sur des crons.

---

## 6. Synthèse : réutiliser / réécrire / créer

| Réutiliser tel quel ou presque | Réécrire / adapter | Créer |
|---|---|---|
| Sécurité HTTP, chiffrement PII, HMAC, rate-limit Redis, idempotence, crons verrouillés, stockage S3 signé, outbox, Sentry/OTel/Prometheus, Swagger, parseur CSV, tests existants | Auth (sans Clerk), rôles, connecteurs MTN/Airtel, paiements (statuts, livemode, montants), webhooks sortants (en-tête, 24 h), KYC (Sumsub + KYB), notifications → service Messages, liens de paiement, réconciliation, dashboard (PWA), admin, checkout | Boutiques/caisses, mocks fournisseurs, file BullMQ, OTP, WhatsApp, QR PDF, Vérif web push, cash déclaré, exports, Recouvrer, Pack École, Facturation & crédits, journal d'audit, carte (mock), Playwright, docker-compose complet, environnements préprod/prod |
