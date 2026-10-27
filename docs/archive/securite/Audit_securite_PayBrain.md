# Audit de sécurité — PayBrain v1.0.0
**Auditeur** : Ingénieur cybersécurité senior (spécialiste fintech)
**Périmètre** : `paybrain/` + `dashboard/`
**Date** : 2026-06-16
**Niveau** : Audit pré-pilote (code review + threat modeling)

---

## Résumé exécutif

L'analyse de PayBrain révèle **17 vulnérabilités** dont **6 critiques** qui rendent l'application impropre à manipuler des fonds réels en l'état. Les défauts touchent les cinq domaines audités. La priorité absolue est la triade **HMAC webhook + idempotence + hashing clés API** sans laquelle un attaquant peut respectivement : injecter de faux paiements confirmés, provoquer des doubles débits, et voler les clés en cas de fuite DB.

| Sévérité | Nombre | Catégorie principale |
|---|---|---|
| **Critique** (CVSS ≥ 9) | 6 | Webhook forgery, secrets, idempotence, race conditions |
| **Élevée** (7-8.9) | 5 | Injection, replay, validation |
| **Moyenne** (4-6.9) | 4 | Logs, CORS, error masking |
| **Basse** (< 4) | 2 | Hygiène |

---

## Catégorie 1 — Injection et validation des données

### PAY-VULN-001 — Validation d'entrée minimaliste (Élevée, CVSS 7.5)

**Localisation** : `paybrain/src/routes/payments.js:11-19`

```js
const { amount, phone, description, merchantExternalId } = req.body;
if (!amount || !phone) return res.status(400).json({ error: 'amount et phone sont requis' });
if (Number(amount) <= 0) return res.status(400).json({ error: 'Montant invalide' });
```

**Problèmes** :
- Aucun contrôle de type (`amount: "100; DROP TABLE..."` passe le check)
- `Number(amount)` accepte `Infinity`, `1e308`, `0.0001`
- Pas de borne supérieure → un marchand peut tenter `Number.MAX_VALUE`
- `description` non bornée → DoS via 100 MB de texte
- Champs additionnels acceptés silencieusement (mass-assignment)
- Pas de validation du format du numéro
- `merchantExternalId` accepte caractères de contrôle

**Exploit** :
```bash
curl -X POST .../payments \
  -d '{"amount": 9999999999999999, "phone": "242066xxxxxxx", "extraField": "<svg onload=alert(1)>"}'
```
Crée une transaction de plusieurs quadrillions, affichée dans le dashboard sans escape.

**Recommandation** : schéma Zod strict avec `passthrough: false`, validation `libphonenumber-js` pour le format Congo, montants en **entiers (centimes)** entre 100 et 5 000 000 XAF.

---

### PAY-VULN-002 — Pas de limite de taille de corps (Élevée, CVSS 7.5)

**Localisation** : `paybrain/src/index.js:24` — `app.use(express.json())`

**Problème** : aucune option `limit`, donc Express accepte par défaut 100 KB mais sans rejet propre. Un attaquant peut envoyer 99 KB de JSON imbriqué pour provoquer un DoS via parsing CPU.

**Recommandation** : `express.json({ limit: '8kb', strict: true })` + middleware anti prototype pollution.

---

### PAY-VULN-003 — Information disclosure dans les erreurs (Moyenne, CVSS 5.3)

**Localisation** : `paybrain/src/routes/payments.js:56`

```js
res.status(500).json({ error: error.message });
```

**Problème** : renvoie au client le message d'erreur brut, qui peut contenir : trace stack, chaîne de connexion, structure interne, version d'Axios, message MTN.

**Exploit** : forcer une erreur DB ⇒ `connect ECONNREFUSED 10.0.0.5:5432`, ce qui révèle la topologie réseau interne.

**Recommandation** : réponse générique côté client + log structuré côté serveur avec `error_id`.

---

### PAY-VULN-004 — CORS ouvert à `*` (Moyenne, CVSS 6.1)

**Localisation** : `paybrain/src/index.js:27-31`

```js
res.header('Access-Control-Allow-Origin', '*');
```

**Problème** : combiné avec `X-API-Key` autorisé en header, tout site malveillant peut faire des requêtes authentifiées depuis le navigateur d'un marchand connecté à son CMS s'il y a réutilisation de clé.

**Recommandation** : allowlist explicite par environnement, `credentials: false` sur les endpoints publics, séparer les CORS du dashboard et de l'API marchand.

---

## Catégorie 2 — Attaque par rejeu et idempotence

### PAY-VULN-005 — Aucune idempotence sur les paiements (Critique, CVSS 9.1)

**Localisation** : `paybrain/src/routes/payments.js:9-58`

**Problème** : si le marchand reçoit un timeout sur sa requête et la rejoue, on crée une **deuxième transaction** chez MTN. Aucun mécanisme de déduplication. Conséquence : **doubles débits clients garantis** sous charge.

**Exploit pratique** : un script qui envoie 100 fois la même requête en parallèle (race window de Express) ⇒ 100 demandes de paiement vers MTN avec 100 `referenceId` différents pour le même `externalId`.

**Recommandation** :
1. Header `Idempotency-Key` obligatoire (format UUID v4)
2. Table `idempotency_keys` avec clé unique (`merchant_id`, `idempotency_key`)
3. Stocker la réponse pour 24h ; toute rejouée renvoie le même résultat
4. Verrou applicatif (Redis SETNX) le temps du traitement
5. Hash du body comparé pour détecter une réutilisation de clé avec contenu différent (collision) ⇒ rejet 422

---

### PAY-VULN-006 — Pas de protection replay sur webhooks (Critique, CVSS 9.3)

**Localisation** : `paybrain/src/routes/webhooks.js`

**Problème** : un attaquant qui capture un webhook légitime (proxy d'entreprise, fuite log) peut le **rejouer indéfiniment**. Combiné à VULN-007 (HMAC absent), il peut même fabriquer le sien.

**Recommandation** :
- Vérifier `X-Timestamp` du webhook dans une fenêtre ±300 s
- Stocker l'ID d'événement reçu (`event_id`) ; rejeter les doublons (idempotence webhook)
- Index unique sur `webhooks_log.event_id`

---

## Catégorie 3 — Falsification de webhooks

### PAY-VULN-007 — HMAC non vérifié (CRITIQUE, CVSS 9.8)

**Localisation** : `paybrain/src/routes/webhooks.js:13`

```js
// TODO production : valider signature HMAC MTN avant traitement
```

**Problème** : **n'importe qui** peut POSTer sur `/webhooks/mtn` avec un payload de son choix et faire passer une transaction `PENDING` en `SUCCESSFUL`. C'est le bug le plus grave de l'application.

**Exploit** :
```bash
curl -X POST https://api.paybrain.cg/webhooks/mtn \
  -H "Content-Type: application/json" \
  -d '{"status":"SUCCESSFUL","externalId":"<id_du_marchand>","financialTransactionId":"<uuid>"}'
```
Le marchand voit son paiement confirmé sans qu'aucun fond ne soit transféré. Si combiné avec un settlement automatique, l'attaquant détourne directement des fonds.

**Recommandation impérative** : implémenter la vérification HMAC SHA-256 avec **comparaison à temps constant** (`crypto.timingSafeEqual`), secret stocké en KMS, rejet 401 si invalide, **et ne JAMAIS répondre 200 à un webhook non vérifié**.

---

### PAY-VULN-008 — Toujours 200 même en erreur (Élevée, CVSS 7.2)

**Localisation** : `paybrain/src/routes/webhooks.js:41`

```js
res.status(200).json({ received: true, error: error.message });
```

**Problème** : masque les attaques (un attaquant ne distingue pas une signature valide d'une signature invalide), empêche MTN de réessayer en cas d'erreur de traitement légitime, et expose `error.message`.

**Recommandation** : `401` si HMAC invalide, `400` si payload malformé, `500` si erreur interne — laisser MTN réessayer.

---

### PAY-VULN-009 — Pas d'IP allowlist (Moyenne, CVSS 5.4)

**Problème** : MTN publie ses plages IP pour les callbacks. Filtrer ces IP au niveau du WAF ajoute une couche défensive simple. Aujourd'hui : pas filtré.

**Recommandation** : allowlist IP MTN au niveau Cloudflare ou ALB, ne pas s'appuyer dessus comme unique défense (l'HMAC reste obligatoire).

---

## Catégorie 4 — Stockage des secrets et chiffrement

### PAY-VULN-010 — Clés API stockées en clair (CRITIQUE, CVSS 9.1)

**Localisation** : `paybrain/db/schema.sql:6` + `paybrain/src/middleware/auth.js:9-12`

```sql
api_key VARCHAR(255) UNIQUE NOT NULL,
```

```js
'SELECT id, name FROM merchants WHERE api_key = $1 AND is_active = true'
```

**Problème** : une fuite de la base (backup compromis, SQL injection ailleurs, employé malveillant) expose **toutes les clés API en clair**. Un attaquant peut faire passer n'importe quel paiement pour le compte de n'importe quel marchand.

**Recommandation** :
1. Hash **Argon2id** (memCost 64 MB, time 3, parallel 4)
2. Pepper en Secrets Manager (différent du sel)
3. Préfixe `pk_live_xxxxxxxx` stocké en clair pour identification rapide (index B-tree)
4. Comparaison du hash uniquement
5. Migration : revoke + génère une nouvelle clé pour chaque marchand existant

---

### PAY-VULN-011 — Comparaison de chaîne non timing-safe (Élevée, CVSS 7.5)

**Localisation** : `paybrain/src/middleware/auth.js:9`

**Problème** : `WHERE api_key = $1` en SQL n'est pas timing-attack safe au niveau réseau (mais c'est l'app qui doit aussi se protéger). Une fois la clé hashée (VULN-010), la comparaison Argon2 est intrinsèquement timing-safe. Pour les comparaisons HMAC ailleurs, **toujours** utiliser `crypto.timingSafeEqual`.

---

### PAY-VULN-012 — Secrets dans `.env` engagé en exemple avec vraies valeurs (Élevée, CVSS 7.5)

**Localisation** : `paybrain/.env.example`

```
MTN_SUBSCRIPTION_KEY=4d952767ab594fe096641ac90598f7bd
MTN_API_USER_ID=604c51ad-e956-4de7-a699-3e0f404a2d83
MTN_API_KEY=b067e739354e42c79f04bf6590547253
JWT_SECRET=paybrain_secret_groupe_alpha_2026
API_KEY_SALT=alpha_salt_2026
```

**Problème** : ces valeurs ressemblent à de vraies clés sandbox. Si `.env` réel est calqué sur `.env.example` sans changer, les secrets sont compromis dès la première fuite. Le `JWT_SECRET` est devinable (basé sur des mots français + année).

**Recommandation** : `.env.example` ne contient QUE des placeholders `<TO_BE_FILLED>` ; secrets de prod en Secrets Manager ; rotation immédiate de **tous** ces secrets (sandbox y compris).

---

### PAY-VULN-013 — Pas de chiffrement au repos des PII (Élevée, CVSS 7.0)

**Localisation** : `db/schema.sql` — colonnes `email`, `payer_phone`

**Problème** : numéros de téléphone clients et emails marchands stockés en clair. Une fuite de DB révèle un dataset entier de PII soumis à des obligations CEMAC sur la protection des données.

**Recommandation** :
- Chiffrement au niveau colonne avec **AES-256-GCM** + clé en KMS (envelope encryption)
- Conserver un hash déterministe `SHA-256(value + pepper)` pour les recherches indexées
- Masquage dans les logs (`242****6789`)

---

### PAY-VULN-014 — DB sans TLS forcé (Élevée, CVSS 7.0)

**Localisation** : `paybrain/src/models/transaction.js:3`

```js
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

**Problème** : aucune option `ssl`. Si la DB est sur un autre host, le trafic peut être en clair.

**Recommandation** : `ssl: { rejectUnauthorized: true, ca: caBundle }` en prod, `sslmode=verify-full` dans la connection string.

---

## Catégorie 5 — Race conditions sur les soldes

### PAY-VULN-015 — Pas de ledger en double-entrée (CRITIQUE, CVSS 9.0)

**Localisation** : `db/schema.sql` (absence)

**Problème** : il n'existe pas de table `accounts` ni `journal_entries`. Les "soldes" se calculent en `SUM(amount) FROM transactions WHERE status='SUCCESSFUL'`, ce qui :
- ne distingue pas encaissement et frais
- ignore les commissions
- ne supporte pas la compensation
- n'est pas auditable
- échoue dès la première dispute / chargeback / remboursement

Conséquence inévitable : **incohérences comptables** dès le premier mois en production.

**Recommandation** : implémenter le ledger double-entrée (cf. `Architecture_securite.md` §5).

---

### PAY-VULN-016 — Updates concurrents sans isolation (CRITIQUE, CVSS 8.7)

**Localisation** : `paybrain/src/models/transaction.js:14-21`

```js
async function updateTransactionStatus(mtnReferenceId, status, failureReason) {
  const result = await pool.query(`UPDATE transactions SET status = $1 ... WHERE mtn_reference_id = $3 RETURNING *`, [...]);
}
```

**Problème** : deux webhooks reçus simultanément (`SUCCESSFUL` puis `FAILED` pour la même tx en cas de bug opérateur) peuvent passer la transaction dans l'ordre inverse. Aucun verrou, aucune vérification de l'état précédent, aucun journal d'audit. **Le dernier qui écrit gagne, même si c'est faux**.

**Exploit** : MTN renvoie `SUCCESSFUL` puis re-renvoie `PENDING` par erreur (cas observé en sandbox) ⇒ la transaction marquée succès retombe en pending et le marchand pense ne pas avoir été payé.

**Recommandation** :
- Machine d'état stricte : transitions autorisées uniquement (`pending → processing → succeeded | failed`)
- `SELECT ... FOR UPDATE` avant chaque transition
- Isolation `SERIALIZABLE` sur les écritures financières
- Audit log immutable de chaque transition

---

### PAY-VULN-017 — Float DECIMAL pour montants (Moyenne, CVSS 5.5)

**Localisation** : `db/schema.sql:14` — `amount DECIMAL(10,2)`

**Problème** : `DECIMAL` côté PG est précis, mais le passage JS ⇄ DB via `pg` peut convertir en `Number` (IEEE 754) selon les types parsers. Risque d'arrondi sur opérations cumulées (calcul de commissions).

**Recommandation** : **BIGINT en centimes** côté DB. Manipulation côté code via `bigint` ou `Decimal.js`. Conversion explicite à l'affichage.

---

## Tableau récapitulatif

| ID | Vuln | Catégorie | Sévérité | Effort fix |
|---|---|---|---|---|
| 001 | Validation faible | Injection | 7.5 | 2 j |
| 002 | Pas de limite body | Injection | 7.5 | 0.5 j |
| 003 | Error leakage | Injection | 5.3 | 0.5 j |
| 004 | CORS ouvert | Injection | 6.1 | 0.5 j |
| **005** | **Pas d'idempotence** | **Replay** | **9.1** | **3 j** |
| 006 | Replay webhook | Replay | 9.3 | 1 j |
| **007** | **HMAC absent** | **Webhook** | **9.8** | **2 j** |
| 008 | Toujours 200 | Webhook | 7.2 | 0.5 j |
| 009 | Pas d'IP allowlist | Webhook | 5.4 | 0.5 j |
| **010** | **Clés API en clair** | **Secrets** | **9.1** | **3 j** |
| 011 | Timing comparison | Secrets | 7.5 | 0.5 j |
| 012 | Secrets dans `.env.example` | Secrets | 7.5 | 0.5 j |
| 013 | PII en clair | Secrets | 7.0 | 4 j |
| 014 | DB sans TLS | Secrets | 7.0 | 0.5 j |
| **015** | **Pas de ledger** | **Race** | **9.0** | **8 j** |
| **016** | **Updates concurrents** | **Race** | **8.7** | **3 j** |
| 017 | Float montants | Race | 5.5 | 2 j |

**Effort total** : ~32 jours-développeur pour amener PayBrain au niveau prod-ready sécurité.

---

## Ordre de remédiation prioritaire

1. **Stop & fix** (jour 1) : implémenter HMAC webhook (007), durcir error masking (003)
2. **Semaine 1** : hashing Argon2id des clés API (010), idempotence paiements (005), validation Zod (001-002)
3. **Semaine 2** : ledger double-entrée (015), machine d'état + verrous (016), montants en BIGINT (017)
4. **Semaine 3** : chiffrement PII (013), secrets manager (012), TLS DB (014), allowlist IP (009)
5. **Semaine 4** : tests de pénétration externes ; revalidation

---

*Audit conduit selon OWASP ASVS 4.0 niveau 2 (financial), PCI-DSS 4.0 hors stockage de carte, et lignes directrices BEAC/COBAC sur la sécurité des paiements numériques.*
