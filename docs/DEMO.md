# Démo PayBrain — tester l'agrégateur en local

Cette démo lance l'agrégateur **en mode sandbox** (aucun opérateur réel, aucun
argent réel) avec des comptes et des liens de paiement pré-remplis. Objectif :
tester en 10 minutes les 3 usages de la V1 — **payer un marchand** (lien/QR),
**envoyer/recevoir** (P2P), **payer en devise étrangère** (USD/EUR).

## Prérequis

- Docker Desktop (pour PostgreSQL + Redis)
- Node.js ≥ 20 et `npm`
- Dépôt installé : `npm install` à la racine

## 1. Démarrer la base de données

```bash
docker compose up -d postgres redis
```

## 2. Configurer l'environnement de l'API

Créez `apps/api/.env` (valeurs de dev, jamais de prod) :

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paybrain
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-please-change-abcdefghijklmnop
WALLET_JWT_SECRET=dev-wallet-secret-please-change-abcdefghij
QR_SIGNING_SECRET=dev-qr-secret-please-change-0123456789abcdef
API_KEY_PEPPER=dev-only-pepper-not-for-production-0000000000
# Sandbox : pas d'opérateur réel, pas d'envoi SMS/email réel
```

## 3. Migrer + remplir la base (données de démo)

```bash
npm run db:migrate --workspace=@paybrain/database   # applique les 11 migrations
npm run db:seed     --workspace=@paybrain/database   # crée la démo
```

Le seed affiche les identifiants de démo, par exemple :

```
── DÉMO PayBrain prête ──
  Wallet payeur         : +242 06 600 0001  PIN 1234  (100 000 XAF)
  Wallet destinataire   : +242 06 600 0002  PIN 1234  (20 000 XAF)
  Caissier (QR)         : +242 06 600 0009  PIN 1234
  Lien de paiement XAF  : http://localhost:5174/pay/<id>
  Lien de paiement USD  : http://localhost:5174/pay/<id>
```

## 4. Lancer l'API + la page de paiement

Dans deux terminaux :

```bash
npm run dev --workspace=@paybrain/api        # API sur http://localhost:3000
npm run dev --workspace=@paybrain/checkout   # Checkout sur http://localhost:5174
```

## 5. Scénarios à tester

### A. Payer un marchand en ligne (lien de paiement)
1. Ouvrez le **lien XAF** affiché par le seed dans le navigateur.
2. Saisissez le **numéro payeur `+242066000001`** + **PIN `1234`**, cliquez « Payer ».
3. → Écran « Paiement réussi ». Le marchand est crédité (visible dans le dashboard / via l'API).

### B. Payer en devise étrangère (multi-devises)
1. Ouvrez le **lien USD** (25 USD).
2. La page affiche « 25 USD / ≈ 15 250 XAF débités / Taux 1 USD = 610 XAF ».
3. Payez avec le même wallet → le payeur est débité en XAF, le marchand encaisse en USD.

### C. Envoyer / recevoir des fonds (P2P) — via l'API
```bash
# 1) Connexion du payeur → récupère un token
curl -s -X POST http://localhost:3000/v1/wallet/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"242066000001","pin":"1234"}'
# → { "token": "..." }

# 2) Transfert de 5 000 XAF vers le destinataire
curl -s -X POST http://localhost:3000/v1/wallet/p2p \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <TOKEN>' \
  -d '{"toPhone":"242066000002","amountCents":500000,"description":"Cadeau"}'

# 3) Vérifier le solde du destinataire (login puis balance)
curl -s -X POST http://localhost:3000/v1/wallet/auth/login \
  -H 'Content-Type: application/json' -d '{"phone":"242066000002","pin":"1234"}'
curl -s http://localhost:3000/v1/wallet/balance -H 'Authorization: Bearer <TOKEN_2>'
```
> Rappel : `amountCents` est en centimes ×100 → 5 000 XAF = `500000`.

### D. Plafonds e-money (ALP-174)
Essayez un P2P de `amountCents: 60000000` (600 000 XAF) : refusé en niveau N1 si
au-dessus du plafond par opération. Les plafonds sont éditables via
`PUT /internal/wallet-limits/:level` (en-tête `X-Internal-Token`).

## 6. Applications mobiles (optionnel)

Les apps client et caissier sont dans `mobile/` (Expo). Pour les lancer :
`cd mobile && npm install && npx expo start`. Configurez `apiBaseUrl` vers
`http://<votre-ip-locale>:3000` dans la config Expo.

## Ce que la démo NE fait PAS (attendu)

- **Pas de cash-in/cash-out réel** : nécessite les contrats MTN/Airtel (le solde
  de démo est pré-crédité). En sandbox, le flux existe mais n'appelle pas d'opérateur réel.
- **Pas de SMS/email réels** : les notifications sont journalisées, pas envoyées.
- **Pas de carte Visa** : le paiement « open-loop » (tout site) nécessite un
  émetteur de cartes (voir ALP-176). La démo couvre le paiement des marchands PayBrain.
