Encaissez par **MTN Mobile Money** et **Airtel Money** au Congo avec une seule API. AlphaPay est un fournisseur technique : l'argent de vos clients arrive directement sur **vos** comptes marchands MTN et Airtel. AlphaPay ne détient jamais vos fonds.

# Démarrage

1. Créez votre compte sur le tableau de bord AlphaPay, puis ouvrez **Développeurs → Clés API**.
2. Créez une clé de **test** (`ap_test_…`). Le secret n'est affiché **qu'une seule fois** : copiez-le dans votre gestionnaire de secrets.
3. Lancez votre premier paiement de test :

```bash
curl https://api.alphapay.cg/v1/payments \
  -H "Authorization: Bearer ap_test_xxxxxxxx_votre_secret" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 15000, "phone": "+242060000001", "reference": "cmd-1042" }'
```

Le paiement est créé au statut `en_attente`. Le client valide sur son téléphone avec son code secret Mobile Money, puis le statut devient `réussi`, `échoué` ou `expiré`. Vous êtes prévenu par **webhook** (recommandé) ; vous pouvez aussi lire le paiement avec `GET /v1/payments/{id}`.

# Authentification

Chaque requête porte votre clé dans l'en-tête `Authorization` :

```
Authorization: Bearer ap_live_xxxxxxxx_votre_secret
```

- `ap_test_…` : **mode test**, opérateurs simulés, aucun argent réel. Disponible dès l'inscription.
- `ap_live_…` : **mode live**, vrais paiements. Disponible après validation de votre dossier (KYB) et connexion de vos comptes MTN et Airtel. Sans KYB validé, l'API répond `403 kyb_non_valide`.

Les données des deux modes ne se mélangent jamais : une clé de test ne voit pas les paiements live, et inversement. Gardez vos clés côté serveur, jamais dans une application mobile ou une page web.

# Mode test et numéros de test

En mode test, ces numéros simulent les réponses des opérateurs :

| Numéro | Résultat |
|---|---|
| `+242060000001` | Réussit tout de suite |
| `+242060000002` | Échoue (le client refuse) |
| `+242060000003` | Reste en attente quelques secondes, puis réussit |
| `+242060000004` | N'est jamais validé, puis expire |
| `+242060000005` | Coupure réseau côté opérateur, reprise automatique sans doublon |

Les numéros commençant par `06` sont MTN, ceux commençant par `05` ou `04` sont Airtel. Vous pouvez forcer l'opérateur avec `"operator": "mtn"` ou `"airtel"`.

# Paiements

`POST /v1/payments` crée un paiement Mobile Money.

| Champ | Type | Description |
|---|---|---|
| `amount` | entier | Montant en francs CFA (XAF n'a pas de centimes). Maximum 5 000 000. |
| `phone` | texte | Numéro du payeur, `06 123 45 67` ou `+242061234567`. |
| `reference` | texte | Votre référence (commande, facture), unique par mode. `[A-Za-z0-9_-]`, 64 caractères au plus. |
| `operator` | `mtn` \| `airtel` | Facultatif : déduit du numéro. |
| `description` | texte | Facultatif, 200 caractères au plus. |
| `till_id` | identifiant | Facultatif : caisse qui encaisse. |

Statuts : `en_attente`, `réussi`, `échoué`, `expiré`, `annulé`.

**Node.js**

```js
const res = await fetch('https://api.alphapay.cg/v1/payments', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.ALPHAPAY_KEY}`,
    'Idempotency-Key': crypto.randomUUID(),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ amount: 15000, phone: '+242061234567', reference: 'cmd-1042' }),
});
const payment = await res.json();
```

**PHP**

```php
$ch = curl_init('https://api.alphapay.cg/v1/payments');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer ' . getenv('ALPHAPAY_KEY'),
    'Idempotency-Key: ' . bin2hex(random_bytes(16)),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode(['amount' => 15000, 'phone' => '+242061234567', 'reference' => 'cmd-1042']),
]);
$payment = json_decode(curl_exec($ch), true);
```

**Liste.** `GET /v1/payments` renvoie les paiements du plus récent au plus ancien, 20 par page (`limit` jusqu'à 100). Pour la page suivante, passez `starting_after=<next_cursor>` tant que `has_more` vaut `true`.

# Liens de paiement

`POST /v1/payment-links` crée un lien à partager par WhatsApp ou SMS : montant fixe (`amount`) ou libre (sans `amount`), date d'expiration (`expires_at`), usage unique (par défaut) ou multiple (`multi_use: true`). La réponse contient l'`url` de la page de paiement et des liens de partage `share.whatsapp` et `share.sms` prêts à l'emploi. Un lien expiré, désactivé ou déjà payé affiche un message clair et ne déclenche aucun paiement.

# Idempotence

Ajoutez un en-tête `Idempotency-Key` (UUID) à chaque `POST`. Il est **obligatoire** sur `POST /v1/payments`. Si la même requête est renvoyée avec la même clé dans les 24 heures (coupure réseau, nouvelle tentative), AlphaPay renvoie la même réponse sans refaire l'action, avec l'en-tête `Idempotency-Replayed: true`. La même clé avec un corps différent renvoie `422`.

# Webhooks

Déclarez une URL dans **Développeurs → Webhooks**. AlphaPay y envoie un `POST` JSON à chaque événement :

| Événement | Quand |
|---|---|
| `payment.succeeded` | Le paiement est réussi |
| `payment.failed` | Le paiement a échoué ou a été annulé |
| `payment.expired` | Le client n'a pas validé à temps |
| `message.delivered` | Un message envoyé par l'API Messages est livré |
| `message.failed` | Un message n'a pas pu être livré (tous canaux essayés) |
| `invoice.paid`, `installment.paid` | Factures et échéances (module Recouvrer) |

```json
{
  "id": "evt_6f1c…",
  "object": "event",
  "type": "payment.succeeded",
  "livemode": false,
  "created_at": "2026-11-02T10:15:00.000Z",
  "data": { "object": { "id": "…", "object": "payment", "status": "réussi", "amount": 15000, "currency": "XAF", "reference": "cmd-1042" } }
}
```

Répondez `2xx` en moins de 10 secondes. Sinon AlphaPay réessaie après 1 min, 5 min, 30 min, 2 h, 6 h et 15 h (sur 24 heures). Un même événement peut arriver plus d'une fois : dédoublonnez sur `id`. Le tableau de bord montre chaque livraison et permet de la **renvoyer**.

## Vérifier la signature

Chaque envoi porte l'en-tête `AlphaPay-Signature: t=<horodatage>,v1=<signature>`, où la signature est le HMAC-SHA256 de `"<horodatage>.<corps brut>"` avec le secret de votre endpoint (`whsec_…`). Calculez-la sur le **corps brut**, avant tout décodage JSON, et refusez un horodatage de plus de 5 minutes.

**Node.js (Express)**

```js
const crypto = require('crypto');

app.post('/webhooks/alphapay', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('AlphaPay-Signature') || '';
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', process.env.ALPHAPAY_WEBHOOK_SECRET).update(`${t}.${req.body}`).digest('hex');
  const valid = v1 && v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  if (!valid || Math.abs(Date.now() / 1000 - Number(t)) > 300) return res.sendStatus(400);
  const event = JSON.parse(req.body);
  // … traiter event.type, une seule fois par event.id
  res.sendStatus(200);
});
```

**PHP**

```php
$body = file_get_contents('php://input');
parse_str(str_replace(',', '&', $_SERVER['HTTP_ALPHAPAY_SIGNATURE'] ?? ''), $sig);
$expected = hash_hmac('sha256', ($sig['t'] ?? '') . '.' . $body, getenv('ALPHAPAY_WEBHOOK_SECRET'));
if (!hash_equals($expected, $sig['v1'] ?? '') || abs(time() - (int)($sig['t'] ?? 0)) > 300) {
  http_response_code(400);
  exit;
}
$event = json_decode($body, true);
http_response_code(200);
```

# Messages et OTP

- `POST /v1/messages` envoie un SMS, un WhatsApp ou un email à partir d'un modèle ; avec plusieurs canaux, AlphaPay bascule sur le suivant en cas d'échec (WhatsApp puis SMS).
- `POST /v1/otp/send` envoie un code à usage unique (valable 5 minutes) ; `POST /v1/otp/verify` le vérifie. Après 5 essais faux, le code est bloqué 15 minutes.
- `GET /v1/credits` donne votre solde de crédits de messages. Sans crédit, l'envoi est refusé (`402 credits_insuffisants`). Le mode test est gratuit.

# Erreurs

Toutes les erreurs ont la même forme :

```json
{ "error": { "code": "telephone_invalide", "message": "Numéro de téléphone invalide", "param": "phone", "request_id": "…" } }
```

| HTTP | Signification |
|---|---|
| 400 | Requête invalide (`param` indique le champ) |
| 401 | Clé absente, invalide ou révoquée |
| 402 | Crédits de messages insuffisants |
| 403 | Droits insuffisants ou KYB non validé (`kyb_non_valide`) |
| 404 | Objet introuvable (ou appartenant à un autre marchand) |
| 409 | Conflit (requête identique encore en cours) |
| 422 | Règle métier (ex. `operateur_non_connecte` : compte MTN/Airtel du marchand non connecté) |
| 429 | Limite de requêtes atteinte |
| 5xx | Incident AlphaPay ou opérateur : réessayez avec la même `Idempotency-Key` |

Donnez le `request_id` au support pour toute question : il retrouve la requête dans le journal.

# Limites de requêtes

Chaque clé a droit à 100 requêtes par minute. Chaque réponse indique où vous en êtes :

- `RateLimit-Limit` : requêtes permises par minute ;
- `RateLimit-Remaining` : requêtes restantes ;
- `RateLimit-Reset` : secondes avant la remise à zéro.

Au-delà : `429 trop_de_requetes` avec `Retry-After`. Le tableau de bord garde le journal de vos requêtes API pendant 30 jours (méthode, route, statut, durée, `request_id`).
