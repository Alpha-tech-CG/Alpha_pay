# PayBrain — Guide d'Intégration MTN MoMo API
> Groupe Alpha · Miche (DG & Dev) · Juin 2026  
> Stack : Node.js · PostgreSQL · Redis · React/Vite

---

## Statut actuel
- [x] Compte MTN Developer créé (`foxdev51@gmail.com`)
- [x] Abonnement **Alpha-Collection-Bac à sable** actif
- [x] Primary Key & Secondary Key générées
- [ ] API_USER_ID créé via curl
- [ ] API_KEY générée via curl
- [ ] Premier appel `requestToPay` sandbox réussi
- [ ] Webhook callback reçu et traité
- [ ] 50 transactions sandbox documentées (Abraham)

---

## Structure du projet

```
paybrain/
├── .env                          # Variables d'environnement (jamais commit)
├── .gitignore
├── package.json
├── src/
│   ├── index.js                  # Point d'entrée Express
│   ├── connectors/
│   │   ├── mtn-connector.js      # Intégration MTN MoMo API
│   │   └── airtel-connector.js   # Intégration Airtel (Phase 3)
│   ├── routes/
│   │   ├── payments.js           # POST /payments
│   │   └── webhooks.js           # POST /webhooks/mtn
│   ├── models/
│   │   └── transaction.js        # Modèle PostgreSQL
│   └── utils/
│       └── router.js             # Détection opérateur par préfixe
├── db/
│   └── schema.sql                # Schéma PostgreSQL complet
└── tests/
    └── mtn-sandbox.test.js       # Tests Abraham
```

---

## Variables d'environnement — `.env`

```env
# MTN MoMo Sandbox
MTN_SUBSCRIPTION_KEY=ta_primary_key_ici
MTN_API_USER_ID=uuid_genere_etape_1
MTN_API_KEY=cle_generee_etape_2
MTN_BASE_URL=https://sandbox.momodeveloper.mtn.com
MTN_ENVIRONMENT=sandbox
MTN_CURRENCY=XAF

# PayBrain Server
PORT=3000
PAYBRAIN_WEBHOOK_URL=http://localhost:3000/webhooks/mtn

# PostgreSQL
DATABASE_URL=postgresql://localhost:5432/paybrain

# Redis
REDIS_URL=redis://localhost:6379

# Sécurité
JWT_SECRET=genere_un_secret_fort_ici
API_KEY_SALT=genere_un_salt_ici
```

> ⚠️ Ajouter `.env` dans `.gitignore` immédiatement.  
> Ne jamais commit les clés MTN.

---

## Étape 0 — Initialiser le projet

```bash
mkdir paybrain && cd paybrain
npm init -y
npm install express axios uuid dotenv pg redis jsonwebtoken
npm install --save-dev nodemon jest

# Créer la structure
mkdir -p src/connectors src/routes src/models src/utils db tests
touch .env .gitignore src/index.js
echo "node_modules/\n.env\n*.log" > .gitignore
```

---

## Étape 1 — Générer API_USER_ID et API_KEY (une seule fois)

Ces 2 appels curl sont à faire **une seule fois** pour configurer le sandbox.

### 1.1 — Générer un UUID pour API_USER_ID

Aller sur https://www.uuidgenerator.net  
Copier le UUID généré. Exemple :
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890
```
Ce UUID devient ta valeur `MTN_API_USER_ID` dans `.env`.

### 1.2 — Créer l'utilisateur API sandbox

```bash
curl -X POST \
  "https://sandbox.momodeveloper.mtn.com/v1_0/apiuser" \
  -H "X-Reference-Id: TON_UUID_ICI" \
  -H "Ocp-Apim-Subscription-Key: TA_PRIMARY_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"providerCallbackHost\": \"localhost\"}"
```

**Réponse attendue :** `HTTP 201 Created` — body vide. C'est normal et correct.

### 1.3 — Générer la API_KEY

```bash
curl -X POST \
  "https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/TON_UUID_ICI/apikey" \
  -H "Ocp-Apim-Subscription-Key: TA_PRIMARY_KEY"
```

**Réponse attendue :**
```json
{ "apiKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

Copier cette valeur dans `.env` → `MTN_API_KEY`

### 1.4 — Vérifier que l'utilisateur est bien créé

```bash
curl -X GET \
  "https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/TON_UUID_ICI" \
  -H "Ocp-Apim-Subscription-Key: TA_PRIMARY_KEY"
```

**Réponse attendue :**
```json
{
  "providerCallbackHost": "localhost",
  "apiKey": null,
  "targetEnvironment": "sandbox"
}
```

---

## Étape 2 — Schéma PostgreSQL

Fichier : `db/schema.sql`

```sql
-- Marchands PayBrain
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  mtn_reference_id UUID UNIQUE NOT NULL,   -- X-Reference-Id envoyé à MTN
  external_id VARCHAR(255),                 -- ID interne marchand
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'XAF',
  payer_phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',     -- PENDING|SUCCESSFUL|FAILED|REJECTED
  payer_message TEXT,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Log des webhooks MTN reçus
CREATE TABLE webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mtn_reference_id UUID,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  received_at TIMESTAMP DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_mtn_ref ON transactions(mtn_reference_id);
```

```bash
# Créer la base et appliquer le schéma
createdb paybrain
psql paybrain < db/schema.sql
```

---

## Étape 3 — Connecteur MTN MoMo

Fichier : `src/connectors/mtn-connector.js`

```javascript
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const BASE_URL = process.env.MTN_BASE_URL;
const SUBSCRIPTION_KEY = process.env.MTN_SUBSCRIPTION_KEY;
const API_USER_ID = process.env.MTN_API_USER_ID;
const API_KEY = process.env.MTN_API_KEY;
const ENVIRONMENT = process.env.MTN_ENVIRONMENT;
const CURRENCY = process.env.MTN_CURRENCY;

// Cache token en mémoire (Redis en production)
let cachedToken = null;
let tokenExpiry = null;

/**
 * Générer le token OAuth2 Bearer
 * Valide 3600 secondes — mis en cache pour éviter les appels inutiles
 */
async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const credentials = Buffer
    .from(`${API_USER_ID}:${API_KEY}`)
    .toString('base64');

  const response = await axios.post(
    `${BASE_URL}/collection/token/`,
    {},
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      }
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (3500 * 1000); // 3500s (marge sécurité)
  return cachedToken;
}

/**
 * Initier un paiement MoMo
 * Retourne le referenceId pour suivi — MTN répond 202 (PENDING)
 */
async function requestToPay({ amount, payerPhone, externalId, description }) {
  const token = await getAccessToken();
  const referenceId = uuidv4(); // UUID unique par transaction

  await axios.post(
    `${BASE_URL}/collection/v1_0/requesttopay`,
    {
      amount: String(amount),
      currency: CURRENCY,
      externalId: externalId || uuidv4(),
      payer: {
        partyIdType: 'MSISDN',
        partyId: payerPhone, // format E.164 : 242XXXXXXXXX
      },
      payerMessage: description || 'Paiement PayBrain',
      payeeNote: 'PayBrain',
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': ENVIRONMENT,
        'X-Callback-Url': process.env.PAYBRAIN_WEBHOOK_URL,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
      }
    }
  );

  // 202 = accepté, transaction EN ATTENTE de confirmation client
  return { referenceId, status: 'PENDING' };
}

/**
 * Vérifier le statut d'une transaction
 * Statuts : PENDING | SUCCESSFUL | FAILED | REJECTED
 */
async function getPaymentStatus(referenceId) {
  const token = await getAccessToken();

  const response = await axios.get(
    `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Target-Environment': ENVIRONMENT,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      }
    }
  );

  return {
    referenceId,
    status: response.data.status,         // PENDING|SUCCESSFUL|FAILED|REJECTED
    amount: response.data.amount,
    currency: response.data.currency,
    payer: response.data.payer,
    reason: response.data.reason || null, // présent si FAILED/REJECTED
  };
}

module.exports = { requestToPay, getPaymentStatus, getAccessToken };
```

---

## Étape 4 — Utilitaire de routing opérateur

Fichier : `src/utils/router.js`

```javascript
/**
 * Détecter l'opérateur mobile selon le préfixe du numéro congolais
 * Format attendu : 242XXXXXXXXX (E.164 sans le +)
 */
function detectOperator(phoneNumber) {
  // Normaliser : enlever +, espaces, tirets
  const normalized = phoneNumber.replace(/[\s\-\+]/g, '');

  // Congo-Brazzaville : indicatif 242
  // MTN Congo : 066, 067, 068
  // Airtel Congo : 055, 056, 057, 058, 074, 075, 076, 077
  
  if (!normalized.startsWith('242')) {
    throw new Error(`Numéro invalide : doit commencer par 242. Reçu : ${phoneNumber}`);
  }

  const prefix = normalized.substring(3, 6); // 3 chiffres après 242

  const MTN_PREFIXES = ['066', '067', '068'];
  const AIRTEL_PREFIXES = ['055', '056', '057', '058', '074', '075', '076', '077'];

  if (MTN_PREFIXES.includes(prefix)) return 'MTN';
  if (AIRTEL_PREFIXES.includes(prefix)) return 'AIRTEL';

  throw new Error(`Opérateur non reconnu pour le préfixe ${prefix}`);
}

/**
 * Normaliser un numéro en format E.164 sans le +
 */
function normalizePhone(phoneNumber) {
  let normalized = phoneNumber.replace(/[\s\-\+]/g, '');
  if (normalized.startsWith('0')) {
    normalized = '242' + normalized.substring(1);
  }
  return normalized;
}

module.exports = { detectOperator, normalizePhone };
```

---

## Étape 5 — Route principale paiement

Fichier : `src/routes/payments.js`

```javascript
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requestToPay } = require('../connectors/mtn-connector');
const { detectOperator, normalizePhone } = require('../utils/router');
const router = express.Router();

/**
 * POST /payments
 * Corps attendu :
 * {
 *   "amount": 5000,
 *   "phone": "242066XXXXXX",
 *   "description": "Frais scolarité Janvier",
 *   "merchantExternalId": "ECOLE-001-INV-2026"
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { amount, phone, description, merchantExternalId } = req.body;

    // Validations de base
    if (!amount || !phone) {
      return res.status(400).json({ error: 'amount et phone sont requis' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    // Normaliser le numéro
    const normalizedPhone = normalizePhone(phone);

    // Détecter l'opérateur
    const operator = detectOperator(normalizedPhone);

    // Pour l'instant : MTN uniquement (Phase 2)
    // Airtel sera ajouté en Phase 3
    if (operator !== 'MTN') {
      return res.status(400).json({
        error: 'Airtel Money sera disponible prochainement. Utilisez un numéro MTN.'
      });
    }

    // Initier le paiement MTN
    const { referenceId } = await requestToPay({
      amount,
      payerPhone: normalizedPhone,
      externalId: merchantExternalId || uuidv4(),
      description,
    });

    // TODO Phase 2 : sauvegarder en PostgreSQL ici

    res.status(202).json({
      success: true,
      referenceId,
      status: 'PENDING',
      message: 'Demande de paiement envoyée. Le client doit confirmer sur son téléphone.',
      operator,
    });

  } catch (error) {
    console.error('[PayBrain] Erreur paiement:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /payments/:referenceId
 * Vérifier le statut d'une transaction
 */
router.get('/:referenceId', async (req, res) => {
  try {
    const { getPaymentStatus } = require('../connectors/mtn-connector');
    const result = await getPaymentStatus(req.params.referenceId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## Étape 6 — Route webhook (callbacks MTN)

Fichier : `src/routes/webhooks.js`

```javascript
const express = require('express');
const router = express.Router();

/**
 * POST /webhooks/mtn
 * MTN appelle cette URL quand un paiement est confirmé, refusé ou expiré
 * 
 * Payload MTN attendu :
 * {
 *   "financialTransactionId": "...",
 *   "externalId": "...",
 *   "amount": "5000",
 *   "currency": "XAF",
 *   "payer": { "partyIdType": "MSISDN", "partyId": "242066..." },
 *   "status": "SUCCESSFUL" | "FAILED" | "REJECTED"
 * }
 */
router.post('/mtn', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[Webhook MTN reçu]', JSON.stringify(payload, null, 2));

    const { status, externalId } = payload;

    // TODO : 
    // 1. Vérifier la signature (en production)
    // 2. Mettre à jour le statut dans PostgreSQL
    // 3. Notifier le marchand (email/webhook sortant)

    if (status === 'SUCCESSFUL') {
      console.log(`✅ Paiement confirmé : ${externalId}`);
      // await updateTransactionStatus(externalId, 'SUCCESSFUL');
    } else if (status === 'FAILED' || status === 'REJECTED') {
      console.log(`❌ Paiement échoué : ${externalId} — ${status}`);
      // await updateTransactionStatus(externalId, status);
    }

    // Toujours répondre 200 à MTN pour accuser réception
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook MTN] Erreur:', error.message);
    // Répondre 200 quand même — MTN ne doit pas retry en boucle
    res.status(200).json({ received: true, error: error.message });
  }
});

module.exports = router;
```

---

## Étape 7 — Point d'entrée Express

Fichier : `src/index.js`

```javascript
require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

// Routes
app.use('/payments', require('./routes/payments'));
app.use('/webhooks', require('./routes/webhooks'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'PayBrain API', version: '1.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 PayBrain API démarrée sur le port ${PORT}`);
});
```

---

## Étape 8 — Test du premier paiement sandbox

### 8.1 Démarrer le serveur

```bash
node src/index.js
# ou en mode dev :
npx nodemon src/index.js
```

### 8.2 Créer un faux numéro MTN sandbox

Avant de tester, créer un utilisateur de test sandbox via l'API Provisionnement :

```bash
curl -X POST \
  "https://sandbox.momodeveloper.mtn.com/v1_0/apiuser" \
  -H "X-Reference-Id: uuid-pour-user-test" \
  -H "Ocp-Apim-Subscription-Key: TA_PRIMARY_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"providerCallbackHost\": \"localhost\"}"
```

MTN fournit des numéros de test sandbox pré-configurés :
- `46733123450` — simulation paiement SUCCESSFUL
- `46733123451` — simulation paiement FAILED
- `46733123452` — simulation paiement REJECTED

> Note : En sandbox Congo, utiliser ces numéros de test MTN tels quels (sans préfixe 242).  
> Adapter le router.js pour accepter ces numéros en mode sandbox.

### 8.3 Envoyer un paiement test

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "phone": "46733123450",
    "description": "Test frais scolaires Alpha-Educ",
    "merchantExternalId": "TEST-001"
  }'
```

**Réponse attendue :**
```json
{
  "success": true,
  "referenceId": "uuid-genere",
  "status": "PENDING",
  "message": "Demande de paiement envoyée. Le client doit confirmer sur son téléphone.",
  "operator": "MTN"
}
```

### 8.4 Vérifier le statut

```bash
curl http://localhost:3000/payments/UUID_REFERENCE_ID_ICI
```

**Réponse attendue :**
```json
{
  "referenceId": "...",
  "status": "SUCCESSFUL",
  "amount": "5000",
  "currency": "XAF",
  "payer": { "partyIdType": "MSISDN", "partyId": "46733123450" },
  "reason": null
}
```

---

## Étape 9 — Exposer le webhook en sandbox (ngrok)

MTN a besoin d'une URL publique pour envoyer les callbacks.  
En local, utiliser ngrok :

```bash
# Installer ngrok : https://ngrok.com
ngrok http 3000
```

Copier l'URL générée (ex: `https://abc123.ngrok.io`) et mettre à jour `.env` :
```env
PAYBRAIN_WEBHOOK_URL=https://abc123.ngrok.io/webhooks/mtn
```

Redémarrer le serveur après modification du `.env`.

---

## Checklist tests Abraham (Phase 2)

Abraham doit exécuter et documenter ces 50 scénarios :

| # | Scénario | Numéro test | Résultat attendu |
|---|---|---|---|
| 1–20 | Paiements normaux | 46733123450 | SUCCESSFUL |
| 21–30 | Paiements refusés client | 46733123451 | FAILED |
| 31–35 | Paiements rejetés | 46733123452 | REJECTED |
| 36–40 | Montants limites (1 XAF, 999999 XAF) | 46733123450 | SUCCESSFUL |
| 41–45 | Numéros malformés | N/A | Erreur 400 |
| 46–50 | Double référenceId (409) | 46733123450 | Erreur 409 gérée |

Pour chaque test, documenter : timestamp, referenceId, statut reçu, statut webhook.

---

## Codes d'erreur MTN à gérer

| Code | Signification | Action PayBrain |
|---|---|---|
| 202 | Paiement en attente | Stocker PENDING, attendre webhook |
| 400 | Données invalides | Logger, retourner erreur au marchand |
| 404 | ReferenceId inconnu | Alerte, vérifier la DB |
| 409 | ReferenceId déjà utilisé | Toujours générer un UUID frais |
| 500 | Erreur MTN | Retry après 30s via Redis queue |

---

## Phase 3 — Ajout Airtel Money (après pilote MTN)

Le connecteur Airtel suivra le même pattern.  
Portail : https://developers.airtel.africa  
Différences clés à noter :
- Endpoint différent : `/merchant/v2/payments/`
- Auth : OAuth2 également mais flow légèrement différent
- Numéros Congo : préfixes 055–058 et 074–077

---

## Ressources

- MTN MoMo Developer Portal : https://momodeveloper.mtn.com
- Documentation Collection API : https://momodeveloper.mtn.com/docs/services/collection
- Airtel Africa Developer : https://developers.airtel.africa
- UUID Generator : https://www.uuidgenerator.net
- ngrok (webhooks local) : https://ngrok.com
- ANPCE Congo (protection juridique) : dépôt nom commercial PayBrain

---

## Notes importantes

> **Sécurité** : Ne jamais commit le `.env`. Ajouter au `.gitignore` dès l'init.

> **Production** : Remplacer `MTN_ENVIRONMENT=sandbox` par `production` et utiliser les clés production MTN Congo (accord commercial requis).

> **Token OAuth2** : Le token expire en 3600s. En production, utiliser Redis pour le cache avec TTL de 3500s.

> **Webhook en production** : Valider la signature HMAC de MTN avant de traiter le payload. Ne pas skipper cette étape en production.

> **Numéros sandbox** : Les numéros de test MTN (46733123450 etc.) ne fonctionnent qu'en sandbox. En production, vrais numéros 242XXXXXXXXX requis.

---

## Suivi d'avancement — Dernière mise à jour : 16 juin 2026

### PHASE 1 — Fondations ✅ TERMINÉE

| # | Tâche | Statut |
|---|-------|--------|
| 1.1 | Compte MTN MoMo sandbox + clés API | ✅ |
| 1.2 | Compte Airtel Africa sandbox | ✅ (clés en attente d'approbation) |
| 1.3 | BRD rédigé | ✅ `paybrain/docs/BRD_PayBrain_v1.docx` |
| 1.4 | FSD rédigé | ✅ `paybrain/docs/FSD_PayBrain_v1.docx` |
| 1.5 | Repo Git initialisé avec structure | ✅ `D:\Alphapay\paybrain\` |
| 1.6 | Protection ANPCE | ⏳ À faire (démarche utilisateur) |

### PHASE 2 — MVP MTN Sandbox ✅ TERMINÉE

| # | Tâche | Statut |
|---|-------|--------|
| 2.1 | Connecteur MTN MoMo (OAuth2 + requestToPay + status) | ✅ `src/connectors/mtn-connector.js` |
| 2.2 | API Gateway : routing opérateur, auth API Key, logs | ✅ `src/routes/payments.js` + `src/middleware/auth.js` |
| 2.3 | Schéma PostgreSQL : merchants, transactions, webhooks_log | ✅ `db/schema.sql` |
| 2.4 | Webhooks MTN entrants → mise à jour statut transaction | ✅ `src/routes/webhooks.js` |
| 2.5 | Génération lien de paiement POST /paylinks | ✅ `src/routes/paylinks.js` |
| 2.6 | 50 tests sandbox Abraham (50/50 passés) | ✅ `tests/abraham-50.test.js` |
| 2.7 | Dashboard React temps réel (WebSocket + filtres) | ✅ `dashboard/src/App.jsx` |

**État technique actuel (16 juin 2026) :**
- Backend Node.js sur port 3000 (relancer avec `node src/index.js` depuis `paybrain/`)
- Dashboard Vite sur port 5174/autoPort (relancer avec `npm run dev` depuis `dashboard/`)
- PostgreSQL : DB `paybrain`, ~50 transactions en base, marchand Alpha-Educ actif
- ngrok authtoken configuré, URL : `manifesto-emerald-venomous.ngrok-free.dev`
- MTN API User ID : `bfe91e53-785a-4fd4-8c8f-36c9164a4edb`
- Devise sandbox : **EUR** (MTN sandbox refuse XAF)

### PHASE 3 — Pilote Réel 🚧 EN COURS

| # | Tâche | Statut |
|---|-------|--------|
| 3.1 | Module Alpha-Educ (collecte frais scolaires) | ⏳ À faire |
| 3.2 | Déploiement 3–5 écoles partenaires | ⏳ À faire |
| 3.3 | Connecteur Airtel Money | ⏳ Bloqué (attente clés API) |
| 3.4 | Deck présentation MTN Congo | ⏳ À faire |
| 3.5 | Rendez-vous MTN Congo | ⏳ À faire |
| 3.6 | Partenariat bancaire BGFI/Ecobank | ⏳ À faire |
| 3.7 | CGU + KYC/AML | ⏳ À faire |

**Manques techniques identifiés avant production :**
- Connecteur Airtel (bloqué sur clés)
- Validation signature HMAC webhook MTN
- Retry automatique sur échec MTN
- Rate limiting API
- Notifications SMS marchand + client
- Remboursements (MTN Disbursement API)
- KYC marchand (onboarding contrôlé)
- Réconciliation journalière
- HTTPS + secrets vault

### PHASE 4 — Production ⏳ Non démarrée
