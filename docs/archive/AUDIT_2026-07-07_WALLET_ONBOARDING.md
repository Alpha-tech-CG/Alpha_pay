# Audit de sécurité — Module Wallet client & Onboarding (7 juillet 2026)

Périmètre : code non commité des nouveaux modules `wallet`, `onboarding`, `clerk` (API),
apps mobiles `(client)`/`(cashier)`, route marketing `api/onboarding/developer`.
Référentiel : charte de sécurité PayBrain (défense en profondeur 5 niveaux).

## Résultat global

Le socle historique reste sain : 35 suites / 214 tests verts, `tsc --noEmit` propre,
17 PAY-VULN fermées. Le **nouveau code wallet introduisait 6 failles réelles**, toutes
corrigées dans ce commit, plus 5 risques résiduels à traiter avant fonds réels (issues Linear créées).

## Failles corrigées ✅

| # | Sévérité | Faille | Correctif |
|---|----------|--------|-----------|
| W-01 | **CRITIQUE** | `payQr` débitait le wallet client mais **ne créditait jamais le marchand** — l'argent disparaissait du circuit (violation conservation de la monnaie) | Création atomique d'une `Transaction` marchand (`operator=WALLET`, `SUCCESSFUL`) dans la même transaction DB → entre dans le settlement engine existant (commission, reversement, reporting) |
| W-02 | **CRITIQUE** | Callbacks opérateur MTN/Airtel **fail-open** : si `MTN_WEBHOOK_SECRET`/`AIRTEL_WEBHOOK_SECRET` absent, la signature HMAC n'était pas vérifiée — en prod, un attaquant pouvait créditer des wallets sans authentification | Fail-closed en production (`NODE_ENV=production` + secret absent → 401), bypass toléré uniquement en dev/sandbox |
| W-03 | **HAUTE** | Double crédit possible : deux callbacks concurrents/rejoués sur le même `operatorRef` passaient tous deux le `findFirst(PENDING)` puis créditaient chacun | Transition d'état par CAS (`updateMany where status=PENDING`) — un seul worker gagne la transition, crédit/remboursement gardé par le CAS |
| W-04 | **HAUTE** | Course sur solde : `payQr`/`cashOut`/`p2p` lisaient le solde puis débitaient (fenêtre entre lecture et écriture) — deux requêtes simultanées pouvaient dépasser le solde (le CHECK DB aurait produit des 500 et des états partiels) | Débit conditionnel atomique `updateMany(where balance >= montant AND status=ACTIVE)` — aucune fenêtre, erreurs métier propres |
| W-05 | **HAUTE** | Aucune idempotence sur les POST wallet (charte : idempotence stricte) — double-tap mobile ou retry réseau = double paiement/transfert | Colonne `idempotency_key` + index unique `(wallet_id, idempotency_key)` (migration 7), clé facultative sur tous les DTOs, rejeu → réponse de la tx d'origine |
| W-06 | **HAUTE** | **Migration manquante pour l'enum `CINETPAY`** : le schéma Prisma le déclarait mais aucun ALTER TYPE — le déploiement prod du connecteur cartes aurait cassé à la première transaction CinetPay | `ALTER TYPE "Operator" ADD VALUE` (CINETPAY + WALLET) dans la migration 7 |

Corrections secondaires : la tx `CASH_OUT` échouée garde son type (piste d'audit) et le
remboursement est matérialisé par une tx `REFUND` distincte ; `getHistory` borne
proprement `limit` (NaN → 30, clamp 1–100) ; montants bornés (`@IsInt @Max`) dans les DTOs.

## Flux onboarding développeur réparé ✅

La landing page postait vers `POST /onboarding/developer` **qui n'existait pas** (dossier
développeur perdu, formulaire en erreur systématique). Ajouté :

- `POST /v1/onboarding/developer` (multipart, rate-limité 5/15 min/IP) — compte `DEVELOPER` en `PENDING`
- Pièce d'identité stockée dans le bucket KYC chiffré (SSE AES-256), fail-closed en prod si bucket absent
- Body guard étendu : allowlist multipart dédiée (`/v1/onboarding/developer`, borne 6 MiB) — les autres chemins restent bornés à 8 KiB JSON (tests ajoutés)
- Colonnes `website`, `use_case`, `id_document_key` sur `merchants` (migration 7)

## Points validés (conformes à la charte)

- PIN wallet en **Argon2id**, vérification anti-timing avec hash factice quand le compte n'existe pas
- Rate limiting dédié : `/v1/wallet/auth` 10/15 min, `/v1/onboarding` 5/15 min, callbacks 120/min
- Webhook Clerk : signature **Svix** vérifiée sur rawBody, anti-replay 5 min, fail-closed
- `WALLET_JWT_SECRET` : refus de démarrage en prod si secret de dev (W3 déjà en place)
- PII marchands (email) chiffrées AES-256-GCM + hash déterministe pour l'unicité
- CHECK DB `balance_cents >= 0` (défense en profondeur)
- Endpoints admin onboarding derrière `InternalGuard` (réseau interne uniquement)

## Risques résiduels — à traiter avant fonds réels (issues Linear créées)

1. ✅ **OTP SMS à l'inscription wallet** (ALP-171, fait) : compte `PENDING_VERIFICATION` + OTP 6 chiffres, anti-préemption.
2. ✅ **QR marchand signé** (ALP-172, fait) : HMAC + expiration + nonce usage unique, généré côté serveur.
3. ✅ **Verrouillage progressif du PIN** (ALP-173, fait) : compteur par wallet, paliers 15 min/1 h/24 h + SMS d'alerte.
4. **Pas de plafonds e-money par niveau KYC** (ALP-174, à faire) : solde max, plafond journalier/mensuel par wallet — seuils à caler avec la banque partenaire. → table de limites + enforcement.
5. ✅ **Réconciliation float wallet** (ALP-175, fait) : job quotidien 3h, invariant Σ soldes == Σ transactions signées + cohérence par wallet, alerte SMS/Sentry, métrique Prometheus, gel des cash-out si dérive critique.

Reste ouvert avant fonds réels : **ALP-174** (plafonds KYC/BEAC) et le pen-test externe (§F).

Le JWT wallet de 30 jours est acceptable pour l'UX mobile (stockage SecureStore) mais à
réévaluer au pen-test ; prévoir la révocation par rotation de `WALLET_JWT_SECRET` en incident.

## Vérifications

- `npx tsc --noEmit` : ✅ propre
- `npx jest --runInBand` : ✅ (voir CI du commit)
- Migration 7 (`7_wallet_hardening`) : additive, sans downtime (ALTER TYPE ADD VALUE + colonnes nullables + index unique sur colonne neuve)
