# AlphaPay

Plateforme de gestion des encaissements pour les marchands du Congo-Brazzaville :
MTN MoMo et Airtel Money (carte bancaire préparée), vérification instantanée des
paiements, gestion et rapprochement, recouvrement (factures, relances, reçus),
Pack École, messages et OTP, API pour les développeurs.

**AlphaPay ne détient jamais l'argent des marchands** : chaque paiement arrive
directement sur le compte Mobile Money du marchand. AlphaPay facture ses propres
services à part (abonnement, crédits de messages). Source de vérité du périmètre :
le cahier des charges V1 ; avancement : [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Démarrer en local (une commande)

Prérequis : Docker Desktop. Tous les fournisseurs externes sont **factices** par
défaut : aucun compte opérateur, KYC ou messagerie n'est nécessaire.

```bash
docker compose up -d --build
```

| Service | Adresse |
|---|---|
| Tableau de bord marchand (PWA) | http://localhost:5174 |
| Back-office AlphaPay | http://localhost:5180 |
| API, page de paiement, portail développeurs | http://localhost:3000 (`/docs`) |
| Emails envoyés (codes, factures, relances) | http://localhost:8025 (MailHog) |

Jeu de démonstration (un commerçant avec ~200 paiements et ses factures, une école
de 50 élèves avec échéanciers et retardataires) :

```bash
docker compose exec api node dist/scripts/demo-seed
```

Comptes `demo.commerce@alphapay.test`, `demo.caisse@alphapay.test`,
`demo.ecole@alphapay.test` ; mot de passe : `DEMO_PASSWORD` de `docker-compose.yml`.
La connexion demande ensuite un code, reçu dans MailHog.

Premier agent du back-office (mot de passe affiché une fois, TOTP à la première connexion) :

```bash
docker compose exec api node dist/scripts/staff-bootstrap agent@alphapay.cg SUPER_ADMIN "Prénom Nom"
```

Numéros de test de l'opérateur factice : `060000001` réussit, `060000002` échoue,
`060000003` est lent, `060000004` expire.

## Tests

```bash
pnpm install
pnpm --filter @paybrain/api test                 # unitaires
pnpm --filter @paybrain/api test:integration     # intégration, Postgres réel (voir docs/RUNBOOK.md)
E2E_CHANNEL=chrome pnpm --filter @paybrain/e2e e2e   # parcours de bout en bout (pile lancée)
```

Les deux parcours Playwright du cahier (§9) sont dans `apps/e2e/tests`. Ils tournent
contre la pile locale ou la préproduction (variables `E2E_*`, voir `apps/e2e/playwright.config.ts`).

## Architecture en une page

```
        Client (téléphone)          Marchand / caissier         Personnel AlphaPay
              │                       (PWA, mobile)                 (back-office)
              ▼                             │                            │
     Page de paiement / QR                  ▼                            ▼
     (pay.…, servie par l'API)     Tableau de bord (app.…)       Back-office (admin.…)
              │                             │ /api                       │ /admin-api
              └──────────────┬──────────────┴─────────────┬──────────────┘
                             ▼                            ▼
                    ┌─────────────────┐  file BullMQ ┌──────────────┐
                    │  API NestJS      │────Redis────▶│   Worker     │
                    │  apps/api        │              │ (même code)  │
                    └────────┬────────┘              └──────┬───────┘
                             │ Prisma                        │
                             ▼                               ▼
                        PostgreSQL               Opérateurs MTN / Airtel (identifiants
                    (packages/database)          DU marchand), SMS, WhatsApp, email,
                                                 KYC, carte — via packages/providers
```

| Dossier | Rôle |
|---|---|
| `apps/api` | API NestJS (`/v1`), page de paiement hébergée, webhooks, worker (`dist/worker`) |
| `packages/database` | Schéma Prisma, migrations versionnées et réversibles (`down.sql`) |
| `packages/providers` | Interfaces fournisseurs (`MobileMoneyProvider`, `KycProvider`, SMS, WhatsApp, email, `CardAcquirer`) : adaptateurs réels + factices, suite de contrat commune |
| `packages/shared` | Montants (entiers, XAF), téléphones E.164 et préfixes opérateurs, chiffrement des données personnelles |
| `dashboard/` | Tableau de bord marchand (React + Vite, PWA, FR/EN) |
| `admin/` | Back-office du personnel (KYB, marchands, paliers, supervision) |
| `apps/e2e` | Recette Playwright |
| `infra/vps` | Production sur VPS OVH : Caddy, secrets, sauvegarde, restauration |

Principes : séparation stricte test/live (`livemode` filtré partout), contrôle
d'accès par rôle **côté serveur**, toute tâche différée dans la file avec nouvelles
tentatives, journal d'audit en ajout seul, aucun secret dans Git.

## Documentation

- [`docs/API.md`](docs/API.md) : API publique, conventions, événements ; spécification [`docs/api/openapi.json`](docs/api/openapi.json) ; portail `/docs`
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) : déploiement, sauvegarde et restauration, rotation des clés, incidents
- [`docs/DEPLOYMENT_VPS.md`](docs/DEPLOYMENT_VPS.md) : installation pas à pas sur le VPS
- [`docs/ADMIN.md`](docs/ADMIN.md) : guide du back-office
- [`docs/GO_LIVE.md`](docs/GO_LIVE.md) : ce qu'il reste à brancher en production
- [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/PLAN.md`](docs/PLAN.md), [`docs/AUDIT.md`](docs/AUDIT.md), [`docs/PROGRESS.md`](docs/PROGRESS.md)
