# PayBrain — version durcie sécurité

> Cette version est une **réécriture** de `paybrain/` post-audit sécurité.
> Elle adresse les 17 vulnérabilités identifiées dans `docs/Audit_securite_PayBrain.md`.

## Lecture obligatoire avant de coder

1. [`docs/Audit_securite_PayBrain.md`](docs/Audit_securite_PayBrain.md) — Audit complet et priorisé
2. [`docs/CLAUDE_SECURITY.md`](docs/CLAUDE_SECURITY.md) — **Règles non-négociables** et patterns à suivre

## Structure

```
security-hardened/
├── docs/
│   ├── Audit_securite_PayBrain.md       # Audit (à lire en premier)
│   └── CLAUDE_SECURITY.md               # Architecture et règles pour Claude Code
├── db/
│   └── schema.sql                       # Schéma durci (ledger, audit, chiffrement)
├── src/
│   ├── index.js                         # Bootstrap avec ordre des middlewares
│   ├── lib/
│   │   ├── crypto.js                    # Primitives (Argon2id, AES-GCM, HMAC, chainHash)
│   │   ├── ledger.js                    # Grand livre double-entrée immutable
│   │   ├── logger.js                    # Pino + redaction PII
│   │   └── secrets.js                   # Chargement depuis Secrets Manager
│   ├── middleware/
│   │   ├── security.js                  # En-têtes, CORS, body limit, rate limit
│   │   ├── auth.js                      # API key + Argon2id + scopes
│   │   ├── idempotency.js               # Idempotency-Key
│   │   ├── validate.js                  # Wrapper Zod
│   │   └── webhook-verify.js            # HMAC + anti-replay + dedup
│   ├── routes/
│   │   ├── payments.js                  # POST /v1/payments
│   │   └── webhooks.js                  # POST /v1/webhooks/mtn
│   ├── connectors/
│   │   └── mtn-connector.js             # MTN durci (timeout, circuit breaker)
│   └── models/
│       └── transaction.js               # Machine d'état + SERIALIZABLE
├── .env.example                         # Placeholders uniquement
└── package.json
```

## Démarrage

```bash
# 1. Générer les peppers locaux
echo "API_KEY_PEPPER=$(openssl rand -base64 48)" >> .env
echo "DETERMINISTIC_HMAC_KEY_B64=$(openssl rand -base64 32)" >> .env
echo "MTN_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Installer
pnpm install

# 3. Préparer la DB
psql $DATABASE_URL < db/schema.sql

# 4. Lancer
pnpm dev
```

## Tests sécurité indispensables avant prod

- [ ] Pen test externe (cabinet)
- [ ] Audit dépendances (`pnpm audit`)
- [ ] Scan secrets (`gitleaks detect`)
- [ ] Tests fuzzing du ledger (`fast-check`)
- [ ] Test : webhook avec mauvaise signature → 401
- [ ] Test : webhook avec timestamp ancien → 401
- [ ] Test : même Idempotency-Key, body différent → 422
- [ ] Test : ledger déséquilibré → rollback
- [ ] Test : tentative UPDATE sur journal_entries → erreur DB
- [ ] Test : log ne contient jamais une PII (regex sur output)

## Checklist d'intégration au repo existant

1. Copier `db/schema.sql` et créer une migration vers cette structure
2. Migrer les clés API : pour chaque marchand existant, générer une nouvelle clé et la communiquer (les anciennes en clair deviennent invalides)
3. Migrer le code Express vers la nouvelle structure module par module
4. Activer Gitleaks en pre-commit + CI
5. Activer Semgrep avec les règles fintech en CI
6. Configurer AWS Secrets Manager + KMS
7. Demander à MTN un endpoint webhook avec signature HMAC (si pas déjà fait — sinon documenter le partage de secret)
8. Faire passer le pen test avant le premier paiement réel

## Status

| Vulnérabilité | Statut |
|---|---|
| PAY-VULN-001 Validation faible | ✅ Zod strict + libphonenumber |
| PAY-VULN-002 Pas de limite body | ✅ `express.json({limit:'8kb'})` + middleware |
| PAY-VULN-003 Error leakage | ✅ `errorHandler` central |
| PAY-VULN-004 CORS ouvert | ✅ allowlist explicite |
| PAY-VULN-005 Pas d'idempotence | ✅ middleware `idempotent` + table |
| PAY-VULN-006 Replay webhook | ✅ skew temporel + dedup event_id |
| PAY-VULN-007 HMAC absent | ✅ `verifyHmac` avec `timingSafeEqual` |
| PAY-VULN-008 Toujours 200 | ✅ 401/400/500 selon le cas |
| PAY-VULN-009 IP allowlist | ⚠ à configurer côté WAF |
| PAY-VULN-010 Clés API en clair | ✅ Argon2id + pepper |
| PAY-VULN-011 Comparison timing | ✅ `crypto.timingSafeEqual` partout |
| PAY-VULN-012 Secrets .env.example | ✅ placeholders uniquement |
| PAY-VULN-013 PII en clair | ✅ AES-256-GCM envelope + hash recherchable |
| PAY-VULN-014 DB sans TLS | ✅ `ssl:{rejectUnauthorized:true}` |
| PAY-VULN-015 Pas de ledger | ✅ double-entrée + hash chain |
| PAY-VULN-016 Updates concurrents | ✅ SERIALIZABLE + FOR UPDATE + machine d'état |
| PAY-VULN-017 Float montants | ✅ BIGINT centimes partout |
