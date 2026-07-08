# Démo PayBrain — tester l'agrégateur en local

Cette démo lance l'agrégateur **en mode sandbox** (aucun opérateur réel, aucun
argent réel) avec des comptes et des liens de paiement pré-remplis. Objectif :
tester en 10 minutes les 3 usages de la V1 — **payer un marchand** (lien/QR),
**envoyer/recevoir** (P2P), **payer en devise étrangère** (USD/EUR).

## Prérequis

- Docker Desktop (pour PostgreSQL + Redis) — **démarré**
- Node.js ≥ 20 et `npm`
- Dépôt installé : `npm install` à la racine

## Démarrage rapide (Windows, une commande)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo-setup.ps1
```

Ce script démarre Postgres/Redis, crée `apps/api/.env`, applique les migrations et
remplit les données de démo. Il affiche à la fin les identifiants et liens de test.
Ensuite, lancez l'API et le checkout (deux terminaux) :

```powershell
npm run dev --workspace=@paybrain/api
npm run dev --workspace=@paybrain/checkout
```

Puis passez directement à la **section 5 (scénarios)**. Le détail manuel suit ci-dessous
si vous préférez ne pas utiliser le script.

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

## 6. Tester sur ton téléphone avec Expo Go

L'app mobile (client + caissier) est dans `mobile/`. Elle se teste sur un vrai
téléphone via **Expo Go**, en se connectant à l'API qui tourne sur ton PC.

### Prérequis
- Le **backend tourne** (étapes 1→4 : Postgres + API sur le port 3000, base seedée).
- Le **téléphone et le PC sont sur le même Wi-Fi**.
- **Expo Go** installé (App Store / Play Store).

### a) Pointer l'app vers ton PC
L'app lit l'URL de l'API depuis `mobile/app.json` → `extra.apiBaseUrl`, déjà réglée
sur `http://192.168.1.174:3000`. **Si l'IP de ton PC est différente**, remplace-la,
ou lance sans éditer de fichier :

```powershell
# Trouver ton IP (Wi-Fi) :
ipconfig | findstr /i "IPv4"
# Lancer en surchargeant l'URL :
$env:EXPO_PUBLIC_API_URL = "http://<TON_IP>:3000"
```

### b) Lancer Expo
```powershell
cd mobile
npm install        # une seule fois
npx expo start
```
Un **QR code** s'affiche dans le terminal.
- **Android** : ouvre Expo Go → « Scan QR code ».
- **iPhone** : ouvre l'appareil photo → scanne le QR → « Ouvrir dans Expo Go ».

### c) Se connecter
Sur l'écran d'accueil : **« Se connecter » → « Compte personnel »**, puis :
- Numéro : `+242 06 600 0001`  ·  PIN : `1234`  (wallet de démo, 100 000 XAF)

Tu peux alors : voir le solde, l'historique, **scanner un QR** marchand, **envoyer**
vers `+242066000002`, etc. Le compte caissier se teste avec `+242066000009` / `1234`.

### Dépannage
- **« Network error » / rien ne charge** : l'`apiBaseUrl` ne pointe pas vers ton PC,
  ou le **pare-feu Windows bloque le port 3000**. Autorise Node.js dans le pare-feu
  (Panneau de configuration → Pare-feu → Autoriser une application), ou teste depuis
  le navigateur du téléphone : `http://<TON_IP>:3000/health` doit répondre.
- **QR ne s'ouvre pas** : lance `npx expo start --tunnel` (fonctionne même hors même Wi-Fi,
  plus lent).
- **Cache** : `npx expo start -c` pour repartir propre.

## Ce que la démo NE fait PAS (attendu)

- **Pas de cash-in/cash-out réel** : nécessite les contrats MTN/Airtel (le solde
  de démo est pré-crédité). En sandbox, le flux existe mais n'appelle pas d'opérateur réel.
- **Pas de SMS/email réels** : les notifications sont journalisées, pas envoyées.
- **Pas de carte Visa** : le paiement « open-loop » (tout site) nécessite un
  émetteur de cartes (voir ALP-176). La démo couvre le paiement des marchands PayBrain.
