# AlphaPay Backend — État (STATUS)

_Dernière mise à jour : 27 juil. 2026. Backend `apps/alphapay-backend` (NestJS 11 + TypeORM + Redis/BullMQ), pattern connecteur `interface → stub → réel`._

## ✅ Fait & vérifié

### Socle
- Scaffold complet, config typée + **validation Joi au démarrage** (une clé réelle manquante avec `*_USE_STUB=false` → boot refusé en nommant la variable — prouvé).
- **Migration TypeORM init** générée **et appliquée** → 11 tables. `db:seed` (user KYC 2 + clé API).
- Sécurité : AES-256-GCM (PII), guards JWT/rôles, rate-limiting, CORS strict, Helmet, clés API bcrypt, PAN jamais stocké.
- `tsc` 0 · **13 tests unitaires** verts.

### Connecteurs (stub + squelette/impl réel + factory)
MTN, Airtel, **Circle** (USDC), **Wise** (remittance), **cartes Union54 (Congo) / Unlimint (Libye)** — impl réelles `fetch` écrites, **FX** (CurrencyLayer), **USSD** (Africa's Talking), **notifications** (SMS AT + email SendGrid).

### Modules
auth (JWT access/refresh + OTP + blacklist Redis), users, kyc (l'approbation promeut le niveau), fx (cache Redis), **payments (local + international, gate KYC + frais + notif)**, cards (émission/topup/reveal/freeze), remittance, merchants + terminaux, qr (HMAC), developer (clés API + logs + `/v1/*`), webhooks (entrants + dispatch), **admin (back-office)**.

### Files BullMQ
`payment-processor` (poll statut, backoff) · `webhook-dispatcher` (livraison signée HMAC).

### Prouvé en live (smoke test)
`register → OTP par SMS → 403 sans KYC → KYC approuvée → paiement local SUCCESSFUL → paiement international Congo→Libye (USDC + devis FX) → 2 transactions`. Back-office : 401 sans token, stats/users/kyc réels avec token. Flux carte : émission → recharge → révélation PAN.

---

## 🔧 Reste à faire — **CÔTÉ CODE**

1. **Corps HTTP réels des connecteurs** : les `*.connector.real.ts` (MTN, Airtel, Circle, Wise, Union54, Unlimint, banques libyennes, KYC, FX, SMS/email) ont la structure d'appel écrite mais doivent être **calés sur la vraie doc de chaque API** (champs exacts req/réponse, pagination, codes d'erreur) — bloqué tant qu'on n'a pas les accès sandbox.
2. **Webhook sortant réel** : le worker `webhook-dispatcher` signe + loggue mais **n'émet pas encore le POST HTTP** vers l'URL marchand (à activer).
3. **Templates de notifications** (critères ALP-143) : templates versionnés (`.mjml`/DB), substitution de variables, **préférences opt-in/opt-out** par catégorie, statut de délivrance.
4. **Autorisation carte → débit wallet USDC temps réel** (ALP-211) : webhook d'autorisation Unlimint → débit + conversion FX + plafonds KYC.
5. **Connecteur banque libyenne réel** (ALP-213) : Wahda/BCD/Aman en implémentation réelle (aujourd'hui stub).
6. **Idempotence paiements** : dédup par `externalId`/clé d'idempotence côté `payments` (déjà présent côté ancien wallet, à porter ici).
7. **Tests** : exporter les services inline (qr/cards/kyc/merchants/remittance/developer/admin) pour les tester isolément ; ajouter des **tests e2e Supertest** sur le flux complet ; test du guard admin et des files BullMQ.
8. **Persistance des logs API** (`api_logs`) : l'intercepteur qui enregistre chaque appel `/v1/*` (l'entité existe, l'écriture reste à brancher).
9. **KYC upload documents** : stockage chiffré des images (S3 + AES) au lieu du base64 en clair dans le DTO.

## ⛔ Reste à faire — **NON-CODE (bloqueurs amont)**
Signer les partenaires (PTSP/banque, agrégateur bootstrap, Unlimint/Walletter, banques libyennes) et récupérer les **clés API réelles** ; conseil juridique CEMAC ; création société ; recruter marchands pilotes ; audit sécurité (pen test) ; déploiement prod (Terraform prêt, Redis/ElastiCache ajouté).

---

## Lancer en local
```bash
docker compose up -d            # postgres + redis (Redis fiable via Docker)
cp .env.example .env            # renseigner JWT secrets + ENCRYPTION_KEY (openssl rand -hex 32) + ADMIN_API_TOKEN
npm install && npm run build
npm run migration:run           # ou start:dev (synchronize en dev)
npm run db:seed                 # optionnel
npm run start:dev
BASE=http://localhost:3000 bash scripts/smoke.sh
```
Voir `DEVELOPMENT.md` pour le détail (stubs, bascule stub→réel, sécurité).
