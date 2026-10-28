# API AlphaPay — documentation

- **Portail développeurs** : `GET /docs` sur l'API (guide en français, référence de chaque route, exemples curl/Node/PHP générés).
- **Spécification OpenAPI 3.1** : `GET /docs/openapi.json`, et copie versionnée ici : [`openapi.json`](openapi.json).
- **Source du guide** : [`apps/api/src/openapi/guide.md`](../../apps/api/src/openapi/guide.md) (démarrage, authentification, numéros de test, paiements, liens, idempotence, webhooks et vérification de signature, messages et OTP, erreurs, limites).

Régénérer la copie après un changement d'API :

```bash
pnpm --filter @paybrain/api openapi
```
