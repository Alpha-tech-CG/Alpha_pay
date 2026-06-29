# CLAUDE_SECURITY.md — Architecture & règles de sécurité pour PayBrain

> **Ce fichier est lu en premier par Claude Code à chaque tâche touchant aux paiements, à l'authentification, au ledger, aux webhooks, aux secrets ou aux données sensibles.**
> Les règles ici sont **non-négociables**. Tout PR qui les viole doit être bloqué en revue.

---

## 0. Principes directeurs

1. **Défense en profondeur** — chaque couche assume que les autres sont compromises.
2. **Sécurité par défaut** — la posture par défaut est `deny` ; on autorise explicitement.
3. **Moindre privilège** — chaque service, clé, IAM role n'a que les droits strictement nécessaires.
4. **Immutabilité financière** — aucune ligne du grand livre n'est jamais modifiée ni supprimée.
5. **Aucun secret en clair** — ni en git, ni en mémoire prolongée, ni en logs, ni en réponse API.
6. **Tout est tracé** — auth, paiement, action admin : audit log immutable.
7. **Idempotence partout** — toute action externe doit pouvoir être rejouée sans effet de bord.

---

## 1. Architecture de sécurité — vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (navigateur / serveur marchand)                      │
└────────────────────────────┬────────────────────────────────┘
                             │ TLS 1.3
┌────────────────────────────▼────────────────────────────────┐
│  CLOUDFLARE  (WAF + DDoS + Bot management + Rate limit)     │
└────────────────────────────┬────────────────────────────────┘
                             │ mTLS optionnel
┌────────────────────────────▼────────────────────────────────┐
│  ALB / API Gateway  (HSTS, CSP, IP allowlist webhooks)      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  APP NODE.JS                                                 │
│  ├─ helmet + body limit 8kb                                 │
│  ├─ CORS allowlist                                          │
│  ├─ Rate limit IP + clé                                     │
│  ├─ Idempotency middleware                                  │
│  ├─ Auth middleware (Argon2id + scopes)                     │
│  ├─ Zod validation                                          │
│  ├─ Business logic                                          │
│  └─ Audit logger                                            │
└────────────────────────────┬────────────────────────────────┘
                             │ TLS (sslmode=verify-full)
┌────────────────────────────▼────────────────────────────────┐
│  POSTGRESQL                                                  │
│  ├─ Ledger (SERIALIZABLE, append-only, hash chain)          │
│  ├─ PII chiffrées AES-256-GCM (envelope via KMS)            │
│  ├─ Triggers anti-UPDATE/DELETE sur journal_entries         │
│  └─ Sauvegardes chiffrées KMS, PITR 35 j                    │
└─────────────────────────────────────────────────────────────┘

Secrets : AWS Secrets Manager (rotation 30/90 j)
Logs    : Loki (structurés JSON, PII masquées)
Audit   : table append-only + WORM S3 (Object Lock)
```

---

## 2. Standards cryptographiques imposés

| Usage | Algorithme | Paramètres | Source |
|---|---|---|---|
| **Hash mot de passe / clé API** | **Argon2id** | memCost 64 MB, time 3, parallel 4, hashLen 32 | NIST SP 800-63B |
| **Hash données indexables** | **HMAC-SHA-256** | clé en KMS (jamais en code) | OWASP ASVS |
| **Chiffrement champs DB** | **AES-256-GCM** | clé envelope encryptée par KMS | NIST SP 800-38D |
| **Signature webhook entrante** | **HMAC-SHA-256** | secret 256 bits, rotation 90 j | Stripe pattern |
| **Signature webhook sortante** | **HMAC-SHA-256** | secret par marchand, header `X-Signature-256` | idem |
| **JWT (si nécessaire)** | **EdDSA (Ed25519)** | rotation clés 90 j | RFC 8037 |
| **Tokens session** | aléatoire 256 bits | `crypto.randomBytes(32)` | — |
| **Transport** | **TLS 1.3** | ciphers AEAD only, HSTS preload | Mozilla intermediate |
| **Comparaison cryptographique** | `crypto.timingSafeEqual` | OBLIGATOIRE | Node docs |
| **Génération aléatoire** | `crypto.randomBytes` / `randomUUID` | jamais `Math.random` | — |

### Choses formellement interdites

- ❌ **MD5, SHA-1** — cassés
- ❌ **DES, 3DES, RC4** — obsolètes
- ❌ **AES-ECB, AES-CBC sans HMAC** — utiliser GCM
- ❌ **bcrypt** pour les clés API (OK pour mots de passe utilisateurs, mais Argon2id est meilleur)
- ❌ **PBKDF2 < 600 000 itérations**
- ❌ **JWT avec algorithme `none` ou `HS256` faible** — Ed25519 ou rien
- ❌ **TLS < 1.2** — minimum 1.2, viser 1.3
- ❌ Toute comparaison `===` ou `==` sur des secrets/HMAC

---

## 3. Patterns à implémenter — checklist obligatoire

### 3.1 Tout endpoint public

```js
router.post('/v1/...',
  bodyLimit('8kb'),           // (1) limite taille
  contentTypeJson(),          // (2) Content-Type strict
  rateLimitByApiKey(),        // (3) rate limit
  requireApiKey(['scope']),   // (4) auth + scope
  validate(Schema),           // (5) validation Zod
  idempotent(),               // (6) idempotence (POST mutants)
  asyncHandler(async (req, res) => {
    // (7) logique métier
    // (8) audit log toute action sensible
    // (9) réponse sanitisée
  })
);
```

Manquer une seule étape sur un endpoint qui touche au paiement est un blocker de PR.

### 3.2 Tout webhook entrant

```js
router.post('/v1/webhooks/:provider',
  rawBody(),                          // body brut requis pour HMAC
  verifyHmac(provider, '8kb'),        // (1) signature HMAC
  verifyTimestamp({ skew: 300 }),     // (2) anti-replay temporel
  verifyEventIdUnique(),              // (3) idempotence
  asyncHandler(async (req, res) => {
    await enqueueForProcessing(req.event); // (4) traitement asynchrone
    res.status(200).end();                 // (5) ACK
  })
);
```

### 3.3 Toute écriture financière

```js
await db.tx({ isolation: 'serializable' }, async tx => {
  // (1) verrou explicite si lecture-puis-écriture
  const account = await tx.one('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [id]);

  // (2) machine d'état stricte
  assertValidTransition(account.status, newStatus);

  // (3) double-entrée : sum(debit) === sum(credit) avant commit
  const entries = buildJournalEntries(...);
  assertBalanced(entries);

  // (4) chaînage cryptographique
  const prevHash = await tx.one('SELECT hash FROM journal_entries ORDER BY id DESC LIMIT 1');
  const newEntries = entries.map(e => ({ ...e, hash: chainHash(prevHash, e) }));

  // (5) écriture append-only
  await tx.batch(newEntries.map(e => tx.none('INSERT INTO journal_entries ...', e)));

  // (6) audit
  await tx.none('INSERT INTO audit_log ...', { actor: req.merchant.id, action: 'payment.create', ... });
});
```

---

## 4. Gestion des secrets — règles strictes

| Type | Stockage | Rotation | Accès |
|---|---|---|---|
| DB credentials | Secrets Manager | 30 j (auto) | IAM role applicatif uniquement |
| HMAC secrets (par connecteur) | Secrets Manager | 90 j (manuel + planifié Linear) | role applicatif |
| Argon2 pepper | Secrets Manager | jamais (sinon migration) | role applicatif |
| Clé KMS (envelope) | AWS KMS managed | annuelle (KMS) | IAM strict |
| API tokens externes (Smile, MTN) | Secrets Manager | selon fournisseur | role applicatif |
| Clé Cloudflare | Secrets Manager | 90 j | role infra |

### Règles

- **Jamais** dans le code source, dans un commit, dans une issue, dans un message Slack
- **Jamais** dans `.env` en production (`.env` uniquement en dev local)
- **Jamais** loggués (ajouter aux redactors pino : `req.headers.authorization`, `req.headers['x-api-key']`, `secret`, `password`, `pepper`)
- Chargement au démarrage uniquement, en mémoire (`Object.freeze`), jamais persistés
- Scan Gitleaks bloquant en CI
- Détection runtime des fuites via Pino redaction

---

## 5. Architecture du grand livre (ledger)

### 5.1 Tables

```sql
-- Comptes (un par marchand + transit + fee + opérateur)
CREATE TABLE accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('merchant','transit','fee','operator','external')),
  owner_id      UUID,                              -- merchant_id si type='merchant'
  currency      CHAR(3) NOT NULL CHECK (currency = 'XAF'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions logiques (regroupe plusieurs écritures)
CREATE TABLE transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        UUID NOT NULL REFERENCES merchants(id),
  idempotency_key    TEXT NOT NULL,
  external_id        TEXT NOT NULL,
  amount_cents       BIGINT NOT NULL CHECK (amount_cents > 0),
  currency           CHAR(3) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','succeeded','failed','refunded')),
  provider           TEXT NOT NULL,
  provider_ref       TEXT,
  payer_phone_enc    BYTEA,                        -- AES-256-GCM
  payer_phone_hash   BYTEA,                        -- HMAC-SHA-256 pour recherche
  payer_phone_mask   TEXT,                         -- ex. "242****6789" pour affichage
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, idempotency_key)
);

-- Écritures (append-only, immutables, chaînées)
CREATE TABLE journal_entries (
  id            BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  account_id    UUID NOT NULL REFERENCES accounts(id),
  debit_cents   BIGINT NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents  BIGINT NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  currency      CHAR(3) NOT NULL,
  prev_hash     BYTEA,                              -- hash de l'entry précédente
  hash          BYTEA NOT NULL,                     -- hash de cette entry
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((debit_cents = 0) <> (credit_cents = 0))  -- une seule colonne non-zéro
);

-- Empêcher mise à jour / suppression
CREATE OR REPLACE FUNCTION prevent_modify() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'journal_entries is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_modify();
CREATE TRIGGER no_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_modify();
```

### 5.2 Règles d'écriture

1. **Toujours en transaction `SERIALIZABLE`**
2. **Valider l'équilibre** : `sum(debit_cents) == sum(credit_cents)` AVANT commit
3. **Chaînage** : `hash = SHA-256(prev_hash || canonical_json(entry))`
4. **Aucune méthode UPDATE/DELETE** exposée
5. **Corrections** : par contre-écriture (nouvelle paire d'entries qui annule + nouvelle valeur)

### 5.3 Calcul de solde

Lecture seule : `SUM(credit_cents - debit_cents) FROM journal_entries WHERE account_id = ?`

Snapshots horaires en table `account_balances_snapshot` pour la perf si volume.

### 5.4 Vérification d'intégrité

Endpoint interne `/internal/ledger/verify` : re-calcule la chaîne, alerte P1 si rupture.

---

## 6. Idempotence — implémentation

### 6.1 Table

```sql
CREATE TABLE idempotency_records (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       UUID NOT NULL REFERENCES merchants(id),
  idempotency_key   TEXT NOT NULL,
  request_hash      BYTEA NOT NULL,                  -- SHA-256 du body canonique
  response_status   INT NOT NULL,
  response_body     JSONB NOT NULL,
  locked_until      TIMESTAMPTZ,                     -- verrou en cours de traitement
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,            -- TTL 24h
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX ON idempotency_records (expires_at);
```

### 6.2 Algorithme

```
1. Lire header `Idempotency-Key` (UUID v4 obligatoire)
2. Calculer SHA-256 du body canonique (clés triées, espaces normalisés)
3. SELECT idempotency_record WHERE merchant_id+key
   - Existe + même hash : renvoyer la réponse stockée (status + body)
   - Existe + hash différent : 422 "idempotency key reused with different body"
   - Existe + locked_until > now : 409 "request in progress"
   - N'existe pas : INSERT avec locked_until = now + 30s
4. Exécuter la logique
5. UPDATE response_status, response_body, locked_until = NULL
6. TTL : nettoyage périodique des records expirés
```

---

## 7. Webhook — sécurité

### 7.1 Entrant (de MTN/Airtel vers nous)

```js
function verifyHmac(provider) {
  const secret = secretsManager.get(`webhook.secret.${provider}`);
  return (req, res, next) => {
    const signature = req.headers['x-signature-256'];
    const timestamp = req.headers['x-timestamp'];

    if (!signature || !timestamp) return res.status(401).end();

    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp));
    if (age > 300) return res.status(401).end();              // ±5 min

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${req.rawBody}`)
      .digest();
    const provided = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');

    if (provided.length !== expected.length) return res.status(401).end();
    if (!crypto.timingSafeEqual(expected, provided)) return res.status(401).end();

    next();
  };
}
```

### 7.2 Sortant (vers les marchands)

- Signature `X-Signature-256: sha256=<hex>` calculée sur `timestamp.body`
- Header `X-Timestamp` (epoch seconds)
- Header `X-Webhook-Id` (UUID) pour idempotence côté marchand
- Secret par marchand, généré à la création du webhook, rotable
- Retry exponentiel : 30s, 2m, 10m, 1h, 6h, 24h

---

## 8. Chiffrement des données sensibles

### 8.1 Champs à chiffrer

| Champ | Méthode | Recherche |
|---|---|---|
| `payer_phone` | AES-256-GCM | hash HMAC-SHA-256 |
| `merchants.email` | AES-256-GCM | hash HMAC-SHA-256 |
| `merchants.tax_id` (NIU) | AES-256-GCM | non recherchable |
| `kyc_documents` (sur S3) | SSE-KMS | non recherchable |
| `payer_phone` (logs) | redacted en `242****6789` | — |

### 8.2 Envelope encryption

1. Génère une **Data Encryption Key (DEK)** par enregistrement (`crypto.randomBytes(32)`)
2. Chiffre la valeur avec DEK en AES-256-GCM (IV 96 bits aléatoire, tag 128 bits)
3. Chiffre la DEK avec la **Key Encryption Key (KEK)** dans KMS
4. Stocke en DB : `iv || encrypted_dek || ciphertext || auth_tag`

Avantages : rotation du KEK n'oblige pas à rechiffrer toute la base, isolation par enregistrement.

### 8.3 Code de référence

```js
// lib/crypto-envelope.js
const ALGO = 'aes-256-gcm';

async function encrypt(plaintext) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encDek = await kms.encrypt({ KeyId: KMS_KEY_ID, Plaintext: dek }).promise();

  // Format binaire compact : version || iv || encDek_len || encDek || tag || ct
  return Buffer.concat([
    Buffer.from([0x01]),
    iv,
    Buffer.from([encDek.CiphertextBlob.length]),
    encDek.CiphertextBlob,
    tag,
    ct,
  ]);
}

async function decrypt(blob) {
  let offset = 1; // version
  const iv = blob.slice(offset, offset + 12); offset += 12;
  const encDekLen = blob[offset]; offset += 1;
  const encDek = blob.slice(offset, offset + encDekLen); offset += encDekLen;
  const tag = blob.slice(offset, offset + 16); offset += 16;
  const ct = blob.slice(offset);

  const { Plaintext: dek } = await kms.decrypt({ CiphertextBlob: encDek }).promise();

  const decipher = crypto.createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

---

## 9. Logs et audit

### 9.1 Logger applicatif (pino)

```js
const logger = pino({
  level: 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers["x-signature-256"]',
      '*.password',
      '*.secret',
      '*.pepper',
      '*.apiKey',
      '*.payerPhone',          // toujours masquer
      '*.email',
    ],
    censor: '***REDACTED***',
  },
});
```

### 9.2 Audit log

Table append-only `audit_log` avec :
- `actor_id`, `actor_type` (merchant / admin / system)
- `action` (`payment.create`, `webhook.received`, `key.rotate`, ...)
- `resource_type`, `resource_id`
- `ip`, `user_agent`
- `before`, `after` (snapshots JSON)
- `request_id`, `trace_id`
- Hash chaîné comme le ledger

Trigger anti-modification identique au `journal_entries`.

Export quotidien vers S3 avec **Object Lock Compliance** (WORM) pour conserver 10 ans inaltérables.

---

## 10. Checklist obligatoire avant tout merge

Toute PR qui touche au paiement, à l'auth, au ledger, aux webhooks, aux secrets DOIT cocher :

- [ ] Aucun secret ajouté en clair (vérifié par Gitleaks en CI)
- [ ] Validation Zod sur tous les inputs externes
- [ ] Idempotence si action mutante (POST/PATCH/DELETE financier)
- [ ] HMAC vérifié sur tous les webhooks entrants
- [ ] Comparaisons cryptographiques en `timingSafeEqual`
- [ ] Aucun montant en `Number` ou `DECIMAL` — toujours BIGINT centimes
- [ ] Écritures ledger en `SERIALIZABLE` + équilibre vérifié
- [ ] Audit log écrit pour toute action sensible
- [ ] Logs sans PII (vérifié via tests dédiés)
- [ ] Tests unitaires + property-based pour le ledger
- [ ] Pas de `error.message` renvoyé au client
- [ ] Couverture > 80 % sur le module modifié
- [ ] Revue par un second développeur (CODEOWNERS)

---

## 11. Anti-patterns à refuser systématiquement

| Pattern | Pourquoi | Remplacement |
|---|---|---|
| `if (apiKey === stored)` | timing attack | `timingSafeEqual` après hash |
| `WHERE api_key = $1` (clé en clair) | fuite DB = compromission totale | Argon2id + comparaison du hash |
| `Math.random()` pour ID/token | prédictible | `crypto.randomBytes` / `randomUUID` |
| `res.json({ error: e.message })` | info leakage | `error_id` + log structuré |
| `app.use(cors())` (sans options) | trop permissif | allowlist explicite |
| `JWT_SECRET=changeme_2026` | devinable | `crypto.randomBytes(32).toString('base64')` |
| `amount: Number(req.body.amount)` | imprécision IEEE 754 | BIGINT centimes |
| `UPDATE balance = balance - $1` | race condition | `SERIALIZABLE` + `FOR UPDATE` |
| `delete from journal_entries` | viole immutabilité | contre-écriture |
| `console.log('payment for', phone)` | PII en clair en log | masquage `242****6789` |
| `JSON.stringify(req.body)` dans error log | secrets potentiels | log structuré + redaction pino |

---

## 12. Tests sécurité — minimum exigé

| Cible | Outil | Fréquence |
|---|---|---|
| SAST | **Semgrep** (rules fintech + OWASP) | chaque PR |
| Dépendances | **Snyk** ou **Trivy** + Dependabot | chaque PR |
| Secrets | **Gitleaks** | pré-commit + CI |
| DAST | **OWASP ZAP** automatisé | nuit (staging) |
| Pen test externe | cabinet | pré-pilote + annuel |
| Fuzzing | tests property-based `fast-check` | sur ledger + parseurs |
| Code review | obligatoire | chaque PR |

---

## 13. Réponse à incident

Playbook minimal à avoir avant la prod :

1. **Détection** : alertes critiques (taux échec, écart réconciliation, intrusion suspectée)
2. **Triage** : sévérité (P1-P4), équipe d'astreinte
3. **Confinement** : feature flags pour couper un connecteur, suspendre un marchand
4. **Communication** : modèle pré-rédigé pour clients/marchands
5. **Forensics** : audit logs + WORM S3 immuables
6. **Post-mortem blameless** dans les 5 jours
7. **Notification BEAC/COBAC** si données ou fonds compromis (obligation réglementaire)

---

## 14. Conventions pour Claude Code

Quand Claude Code touche au code, il **doit** :

- Lire ce fichier en premier
- Suivre les patterns de la section 3
- Refuser d'introduire un anti-pattern de la section 11
- Ajouter les tests demandés en section 12
- Mettre à jour la checklist de la PR (section 10)
- En cas de doute sur la sécurité, demander à l'humain avant d'agir

**Toute économie de raccourci sur la sécurité crée une dette qui se paie en argent réel ou en perte de licence.**

---

*Document version 1.0 — à réviser à chaque audit externe et au moins une fois par an.*
