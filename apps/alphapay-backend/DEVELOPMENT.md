# AlphaPay Backend — Development

NestJS 10 + PostgreSQL (TypeORM) + Redis (ioredis). Payment aggregator for **Congo & Libya**.
Every external integration follows the **connector pattern**: `interface → stub → real`. The app
only talks to the interface; the stub or real class is chosen at runtime by a `*_USE_STUB` env flag.

## Quick start

```bash
cp .env.example .env          # then set JWT secrets + ENCRYPTION_KEY (see below)
docker compose up -d          # postgres + redis
npm install
npm run start:dev             # http://localhost:3000  (synchronize=true in dev creates tables)
```

Generate the required secrets:

```bash
# JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
openssl rand -hex 32
# ENCRYPTION_KEY (must be exactly 64 hex chars = 32 bytes)
openssl rand -hex 32
```

With every `*_USE_STUB=true` (the defaults) the app boots with **no third-party keys**.

## MVP end-to-end (smoke test)

Le backend tourne de bout en bout avec les stubs — aucun compte tiers requis.

```bash
docker compose up -d          # postgres + redis
npm run start:dev             # tables auto-créées (synchronize en dev)
npm run db:seed               # (optionnel) user KYC niveau 2 + clé API sandbox
BASE=http://localhost:3000 bash scripts/smoke.sh
```

`scripts/smoke.sh` déroule le parcours complet et l'assERTe :
1. `health` → ok
2. `register` → OTP envoyé (dev: `123456`)
3. `verify-otp` → access + refresh tokens
4. `payments/local` **sans KYC** → **403** (gate KYC niveau 1)
5. `kyc/submit` (LEVEL_2) → auto-approuvé (stub) → le niveau KYC de l'user passe à 2
6. `payments/local` → **SUCCESSFUL** (connecteur MTN stub)
7. `payments/international` (corridor Congo→Libye) → devis FX + conversion USDC (Circle stub)
8. `payments` → liste les 2 transactions de l'utilisateur

## Migrations

Dev uses TypeORM `synchronize` (auto-creates tables). For production, disable synchronize and use migrations:

```bash
npm run migration:generate -- src/database/migrations/Init
npm run migration:run
npm run migration:revert
```

## Switching a connector from stub → real

1. Set the flag, e.g. `MTN_USE_STUB=false` in `.env`.
2. Add the real credentials the Joi schema now requires (e.g. `MTN_API_KEY`, `MTN_API_USER`, `MTN_SUBSCRIPTION_KEY`).
3. Restart. **No code change** — the factory returns the `*.connector.real.ts` implementation.

If you set `USE_STUB=false` but leave keys missing, startup validation (Joi) fails and names the missing var.
If keys are present but the real HTTP call isn't wired yet, the connector throws a clear "not yet wired" error
(the real classes are ready skeletons documenting the exact endpoint/auth to implement).

## Stub behaviours (what each mock returns)

| Connector | Stub behaviour |
|---|---|
| MTN / Airtel (mobile money) | `requestToPay` → `SUCCESSFUL` after ~800ms, `getAccountBalance` → 999999 |
| Circle (USDC) | `convertToUsdc` → `COMPLETE`, usdcAmount = input amount |
| Union54 / Unlimint (cards) | `issueCard` → mock VISA/Mastercard (last4 4821/9032), `revealPan` → mock PAN+CVV |
| Wise | `createTransfer` → `OUTGOING_PAYMENT_SENT` |
| Smile / Sumsub (KYC) | `submit` → auto `APPROVED` |
| Wahda / BCD (Libyan bank) | `debit` → `SUCCESSFUL` |
| USSD (Africa's Talking) | `handleSession` → mock menu text |
| FX (CurrencyLayer) | hardcoded rates (XAF/LYD/USDC/USD/EUR), cached in Redis |
| Auth OTP | always `123456` in dev, stored in Redis with 5-min TTL |

## Security implemented

- JWT access (15m) + refresh (7d); refresh tokens tracked in Redis (`refresh:{userId}:{jti}`), revoked on logout.
- AES-256-GCM `EncryptionService` for PII at rest.
- `JwtAuthGuard` on all routes except `/auth/register|verify-otp|refresh` and `/webhooks/*` (incoming callbacks).
- Ownership checks on every data-returning endpoint (user reads only their own rows).
- Rate limiting via `@nestjs/throttler`: `/auth` 10/min, `/payments` 30/min, `/v1` 100/min, global 120/min.
- Strict CORS (only `FRONTEND_URL`), Helmet.
- API keys stored as bcrypt hashes; raw key returned once. Card PAN never stored (only `lastFour` + issuer ref).

## API surface

- `POST /auth/register` · `POST /auth/verify-otp` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`
- `POST /kyc/submit` · `GET /kyc`
- `GET /fx/rate` · `POST /fx/quote`
- `POST /payments/local` · `POST /payments/international` · `GET /payments/:id` · `GET /payments`
- `POST /cards` · `GET /cards` · `POST /cards/:id/topup` · `POST /cards/:id/reveal` · `POST /cards/:id/freeze`
- `POST /remittance/quote` · `POST /remittance/send`
- `POST /merchants` · `GET /merchants/me` · `GET /merchants/terminals` · `POST /merchants/terminals`
- `GET /qr/static` · `POST /qr/dynamic`
- `POST /developer/keys` · `GET /developer/keys` · `POST /developer/keys/:id/revoke` · `GET /developer/logs`
- `POST /v1/payments/request` (API-key auth)
- `POST /webhooks/:provider` (incoming) · `POST /webhook-endpoints` · `GET /webhook-endpoints`

## Queues (BullMQ)

Two Redis-backed workers under `src/queues/`:
- **`payment-processor`** — after a local payment, if the provider status is still `PENDING`, a `poll-status`
  job is enqueued (30s delay) and re-polls the connector up to 5 times; on a final status it updates the
  transaction and enqueues a webhook.
- **`webhook-dispatcher`** — `WebhooksService.dispatch` and the payment worker enqueue `dispatch` jobs; the
  worker signs the body (HMAC-SHA256) and records a `webhook_delivery_logs` row. Default job options: 3 attempts,
  exponential backoff. (Real outbound HTTP is the one stub left inside the worker.)

## Tests

```bash
npm test
```
Covered: `EncryptionService` (AES-GCM round-trip/tamper), `FxService` (cache + quote math), `AuthService`
(OTP verify), `PaymentsService` (KYC gate + fee), `UsersService` (PII never exposed). 5 suites / 13 tests.

## Known remaining work

- Real HTTP implementations inside each `*.connector.real.ts` (skeletons + endpoint docs are in place) — by design.
- The webhook worker's actual outbound HTTP POST (currently logged + recorded, not sent).
- More unit tests: the qr/cards/kyc/merchants/remittance/developer services are declared inline in their module
  files; export them to unit-test in isolation.

## Tests

```bash
npm test
```
