# Rapport de scan SAST — Alphapay
**Outil** : njsscan (alternative à Horusec, même catégorie SAST)
**Date** : 2026-06-22
**Périmètre** : `paybrain/src`, `paybrain/db`, `dashboard/src`, `securite/src`

---

## Synthèse

| Cible | Findings | ERROR | WARNING | INFO |
|---|---|---|---|---|
| `paybrain/` (PoC original) | 2 | 1 (faux positif) | 1 (confirmé) | 0 |
| `dashboard/` (frontend React) | **1** | **1 (NOUVEAU)** | 0 | 0 |
| `securite/` (code durci) | 1 | 0 | 1 (faux positif) | 0 |

Note : pourquoi Horusec n'a pas été utilisé : le sandbox bloque les téléchargements depuis `raw.githubusercontent.com` et `api.github.com`, seuls canaux de distribution du binaire Horusec. njsscan + semgrep est l'équivalent moderne (même règles Semgrep en arrière-plan) qui scanne du Node.js de manière équivalente. Voir `INSTALL_HOROUSEC_LOCAL.md` pour installer Horusec sur ta machine si tu y tiens.

---

## Findings détaillés

### 1. paybrain/src/index.js:29 — `express_cors` (WARNING)

**Règle** : `nodejs.express_cors`
**CWE-346** : Origin Validation Error

```js
res.header('Access-Control-Allow-Origin', '*');
```

**Statut** : ✅ **Vulnérabilité confirmée — déjà cataloguée**
**Tracking** : PAY-VULN-004 / [ALP-155](https://linear.app/apha-tech/issue/ALP-155)
**Fix prêt** : `securite/src/middleware/security.js` → `corsAllowlist()`

---

### 2. paybrain/src/models/transaction.js:48 — `node_sqli_injection` (ERROR)

**Règle** : `nodejs.node_sqli_injection`
**CWE-89** : SQL Injection

```js
await pool.query({
    text: 'INSERT INTO webhooks_log (mtn_reference_id, raw_payload) VALUES ($1::text, $2::jsonb)',
    values: [mtnReferenceId || null, JSON.stringify(rawPayload)],
});
```

**Statut** : ❌ **Faux positif**

Le code utilise correctement des paramètres préparés (`$1::text`, `$2::jsonb`) avec `values` séparé. C'est l'API safe de `pg`. njsscan a été dérouté par la syntaxe objet plutôt que la syntaxe positionnelle `pool.query(text, values)`.

**Action** : aucune. Ajouter un commentaire `// nosemgrep: nodejs.node_sqli_injection — paramètres préparés` pour calmer le scanner.

---

### 3. dashboard/src/api.js:5 — `node_api_key` (ERROR) ⚠ NOUVEAU

**Règle** : `nodejs.node_api_key`
**CWE-798** : Use of Hard-coded Credentials

```js
const API_KEY = 'paybrain-key-alpha-educ-2026'
```

**Statut** : ⚠ **VRAIE VULNÉRABILITÉ NOUVELLE** — non identifiée dans l'audit initial.

**Pourquoi c'est critique** :
- Une clé API engagée dans le frontend = exposée à **tous** les visiteurs du site (View Source)
- Tout le monde peut récupérer cette clé et faire des paiements au nom du marchand
- Même si la clé est "test", elle est **engagée dans git** → présente dans tout l'historique
- Pattern observé partout : `dashboard/src/App.jsx`, `dashboard/src/api.js`

**Action requise** :
1. **Révoquer immédiatement** la clé `paybrain-key-alpha-educ-2026` en DB
2. **Ne jamais mettre de clé API live dans un frontend**. Les frontends n'ont pas de secret côté navigateur — tout est visible
3. Pour le dashboard, utiliser une **session utilisateur** (cookie httpOnly + Secure + SameSite=Strict) signée côté backend, jamais une clé API
4. Pour le dashboard *temps réel* (lecture des stats), créer une route `/dashboard/stats` côté backend qui vérifie une session utilisateur, pas une clé API
5. Si une démo nécessite une clé partagée, créer une clé en `mode=test` avec scopes lecture seule et IP allowlist, et stocker en variable d'environnement `.env.local` du dashboard — jamais en clair dans le code
6. **Scanner l'historique git** avec gitleaks et faire une rotation complète des clés

---

### 4. securite/src/routes/payments.js:205 — `regex_dos` (WARNING)

**Règle** : `nodejs.regex_dos`
**CWE-1333** : Inefficient Regular Expression Complexity

```js
if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
```

**Statut** : ❌ **Faux positif**

La regex valide un UUID : caractères bornés `[0-9a-f-]`, longueur bornée `{36}` exacte, pas d'alternance, pas de quantificateurs imbriqués. Aucun risque ReDoS — la complexité reste linéaire en taille d'entrée. njsscan signale par précaution toute regex non-validée par sa heuristique.

**Action** : aucune. Possibilité d'ajouter `// nosemgrep: nodejs.regex_dos — bounded length, no backtracking`.

---

## Limites des SAST (et pourquoi ils ne remplacent pas l'audit humain)

njsscan/Semgrep/Horusec sont excellents pour détecter les **patterns syntaxiques** dangereux : CORS ouvert, clés hardcodées, regex catastrophiques, SQL non paramétré, `eval()`, etc.

Ils sont **mauvais** pour détecter les vulnérabilités **logiques** : HMAC manquant (le code n'a pas de pattern à détecter — c'est l'absence qui est dangereuse), idempotence absente, ledger non équilibré, race conditions, machines d'état faibles.

C'est pourquoi sur les **17 vulnérabilités identifiées dans l'audit humain** :
- **1 seule** a été confirmée automatiquement par njsscan (CORS / PAY-VULN-004)
- **16 autres** sont des problèmes logiques qui nécessitent un œil expert

Conclusion : **SAST = filet bas niveau** (à exécuter à chaque PR via CI), **audit humain = filet haut niveau** (à exécuter avant chaque release majeure et par audit externe annuel).

---

## Prochaines étapes

1. **Issue Linear créée** pour le finding nouveau : voir ALP-169 (`[SEC-FRONT] Clé API hardcodée dans le dashboard`)
2. **Ajouter njsscan en CI** : commande `njsscan --json -o report.json . --exit-warning` dans GitHub Actions
3. **Ajouter Semgrep en CI** avec les règles `p/owasp-top-ten` + `p/javascript` + `p/typescript`
4. **Ajouter Gitleaks** pour scan secrets engagés
5. **Re-scanner** après chaque batch de fix (vérification non-régression)
