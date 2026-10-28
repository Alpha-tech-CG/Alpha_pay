# PayBrain — Guide développeur API

API d'agrégation de paiement mobile money (MTN MoMo, Airtel Money) pour le Congo.

- **Spécification OpenAPI 3.1** : générée depuis NestJS (`@nestjs/swagger`), servie sur
  `GET /docs/openapi.json`.
- **Playground interactif** : `GET /docs` (Swagger UI — essayer les endpoints,
  bouton « Authorize » pour saisir la clé API).
- **Base URL** : `https://api.paybrain.cg` (prod) · `http://localhost:3000` (local).

> Portail développeur hébergé (Scalar/Mintlify) : le `openapi.json` ci-dessus est
> prêt à être importé. Le déploiement du portail et la publication du SDK npm sont
> des étapes externes (cf. section SDK).

## Sommaire
1. [Quickstart](#quickstart)
2. [Authentification](#authentification)
3. [Paiements](#paiements)
4. [Webhooks](#webhooks)
5. [Remboursements](#remboursements)
6. [Erreurs](#erreurs)
7. [SDKs](#sdks)
8. [Versionnement](#versionnement)
9. [Changelog](#changelog)

---

## Quickstart

1. Crée une clé API depuis le dashboard (section **Développeurs**). La clé secrète
   n'est affichée **qu'une seule fois**.
2. Initie un paiement :

```bash
curl -X POST https://api.paybrain.cg/payments \
  -H "X-API-Key: pk_live_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"currency":"XAF","phone":"+242066123456","externalId":"cmd-001"}'
```

3. Configure un webhook pour recevoir le statut final (voir [Webhooks](#webhooks)).

---

## Authentification

Toutes les requêtes mutantes exigent l'en-tête `X-API-Key`.

- Format : `pk_<mode>_<prefix>_<secret>` (`mode` = `test` ou `live`).
- Le secret est **haché** côté serveur (scrypt) — irrécupérable après création.
- Une clé peut porter des **scopes** et une **IP allowlist** optionnelle.
- Rotation / révocation depuis le dashboard ou `POST /v1/api-keys/:id/rotate`,
  `DELETE /v1/api-keys/:id`.

---

## Paiements

`POST /payments` — initie un paiement mobile money.

| Champ | Type | Notes |
|-------|------|-------|
| `amount` | entier | > 0, ≤ 5 000 000 |
| `currency` | string | `XAF`, `EUR`, `USD` |
| `phone` | string | format E.164 (`+242…`) |
| `externalId` | string | `[A-Za-z0-9_-]{1,64}`, unique par marchand |
| `description` | string? | ≤ 200 caractères |

En-têtes : `X-API-Key` (requis), `Idempotency-Key` (UUID v4, requis — empêche les
doubles débits ; un rejeu renvoie la réponse mémorisée avec `Idempotency-Replayed: true`).

**cURL**
```bash
curl -X POST https://api.paybrain.cg/payments \
  -H "X-API-Key: $PAYBRAIN_KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"currency":"XAF","phone":"+242066123456","externalId":"cmd-001"}'
```

**Node.js**
```js
import { randomUUID } from 'node:crypto';

const res = await fetch('https://api.paybrain.cg/payments', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.PAYBRAIN_KEY,
    'Idempotency-Key': randomUUID(),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ amount: 1000, currency: 'XAF', phone: '+242066123456', externalId: 'cmd-001' }),
});
console.log(await res.json());
```

**Python**
```python
import os, uuid, requests

r = requests.post(
    "https://api.paybrain.cg/payments",
    headers={"X-API-Key": os.environ["PAYBRAIN_KEY"], "Idempotency-Key": str(uuid.uuid4())},
    json={"amount": 1000, "currency": "XAF", "phone": "+242066123456", "externalId": "cmd-001"},
)
print(r.json())
```

**PHP**
```php
<?php
$ch = curl_init('https://api.paybrain.cg/payments');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'X-API-Key: ' . getenv('PAYBRAIN_KEY'),
    'Idempotency-Key: ' . bin2hex(random_bytes(16)),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'amount' => 1000, 'currency' => 'XAF', 'phone' => '+242066123456', 'externalId' => 'cmd-001',
  ]),
]);
echo curl_exec($ch);
```

Suivi : `GET /payments/:referenceId`.

---

## Webhooks

PayBrain notifie ton serveur des changements de statut (`payment.succeeded`,
`payment.failed`, `payment.pending`). Configure un endpoint via le dashboard ou
`POST /v1/webhook-endpoints`.

**Sécurité** — chaque requête entrante porte :

| Header | Rôle |
|--------|------|
| `X-Signature-256` | `sha256=` + HMAC-SHA256(`{X-Timestamp}.{corps_brut}`, secret_endpoint) |
| `X-Timestamp` | epoch (s) — rejette au-delà de ±5 min (anti-replay) |
| `X-Webhook-Id` | identifiant unique de livraison (idempotence côté marchand) |

**Vérification (Node.js)**
```js
import crypto from 'node:crypto';

function verify(req, secret) {
  const ts = req.headers['x-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // anti-replay
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(`${ts}.${req.rawBody}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(req.headers['x-signature-256']);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Vérification (Python)**
```python
import hmac, hashlib, time

def verify(headers, raw_body, secret):
    ts = headers["X-Timestamp"]
    if abs(time.time() - int(ts)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), f"{ts}.{raw_body}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers["X-Signature-256"])
```

**Livraison & retry** — en cas d'échec (statut HTTP ≠ 2xx ou timeout 10 s), PayBrain
réessaie selon le barème : **30 s, 2 m, 10 m, 1 h, 6 h, 24 h**, puis marque la
livraison `failed` (alerte email au marchand). Logs consultables dans le dashboard.

Tester un endpoint : `POST /v1/webhook-endpoints/:id/test`.

---

## Remboursements

> 🔜 **Non disponible.** L'endpoint de remboursement n'est pas encore exposé
> (settlement/payout engine — phase Pilote). Cette section sera complétée lors de
> sa livraison.

---

## Erreurs

Réponses d'erreur structurées. Les erreurs serveur (5xx) ne divulguent jamais de
détail interne et incluent un `request_id` corrélable au log serveur.

| Statut | Code | Sens |
|--------|------|------|
| 400 | `idempotency_key_required` | En-tête `Idempotency-Key` manquant/invalide |
| 400 | `invalid_json` | Corps JSON malformé |
| 401 | — | Clé API absente/invalide |
| 413 | `payload_too_large` | Corps > 8 Kio |
| 415 | `unsupported_media_type` | `Content-Type` ≠ `application/json` |
| 422 | `idempotency_collision` | Clé d'idempotence réutilisée avec un corps différent |
| 500 | `internal_error` | Erreur interne (voir `request_id`) |

---

## SDKs

> SDK TypeScript : à publier sur npm (`@paybrain/sdk`). En attendant, l'API est
> 100 % REST et le `openapi.json` permet de générer un client typé via
> `openapi-typescript` / `openapi-generator`.

```bash
npx openapi-typescript https://api.paybrain.cg/docs/openapi.json -o paybrain.d.ts
```

---

## Versionnement

- Les endpoints publics stables sont préfixés **`/v1`** (`/v1/api-keys`,
  `/v1/webhook-endpoints`).
- Les changements rétro-incompatibles donnent lieu à un nouveau préfixe (`/v2`) ;
  `/v1` reste maintenu pendant la période de dépréciation annoncée au changelog.
- La version du schéma OpenAPI est exposée dans `info.version`.

---

## Changelog

- **v1.0** — Paiements MTN/Airtel, liens de paiement, webhooks sortants signés,
  gestion des clés API, idempotence, doc OpenAPI 3.1.
