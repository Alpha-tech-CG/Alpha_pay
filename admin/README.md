# PayBrain — Back-office admin (ALP-144)

Outil interne ultra-restreint pour ops / compliance / finance / support.

## Stack
Vite + React + Clerk. Consomme les endpoints `/internal/*` de l'API via un proxy
qui injecte `X-Internal-Token` **côté serveur** (jamais dans le navigateur).

## Sécurité
- **Auth SSO + MFA** : Clerk (activer l'authenticator app / clé matérielle dans
  le dashboard Clerk → exigence YubiKey/TOTP).
- **RBAC** : rôles `support`, `compliance`, `finance`, `engineering`, `admin`
  (cf. `src/rbac.js`). Le rôle vient de Clerk `publicMetadata.role`. Les routes
  et actions sont gated par capacité.
- **Session courte** : déconnexion auto après 15 min d'inactivité (`useIdleLogout`).
- **Actions sensibles** : double confirmation côté UI (rejet KYC, envoi de
  paiement). La validation 4-eyes des settlements est imposée côté backend
  (2 validateurs distincts > 500 000 FCFA).

## Pages
Recherche marchand · KYC (file de revue + décision) · Settlements (validation
4-eyes, envoi, confirmation) · Réconciliation (écarts).

## Durcissement production (à faire au déploiement)
- **IP allowlist** : exposer le back-office uniquement derrière le VPN / IP bureau
  (règle WAF/ALB ou Cloudflare Access), jamais public.
- **BFF** : en prod, remplacer le proxy Vite par un reverse-proxy/BFF qui (1)
  vérifie la session Clerk + le rôle, (2) injecte `X-Internal-Token`, (3) applique
  l'IP allowlist. Le token interne ne doit jamais transiter par le navigateur.
- **Clerk prod** : instance production (`pk_live_…`) + MFA obligatoire.

## Dev
```bash
npm install
npm run dev   # http://localhost:5180
```
Nécessite l'API sur :3000 et `VITE_CLERK_PUBLISHABLE_KEY` dans `admin/.env`.
