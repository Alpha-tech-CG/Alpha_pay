# PayBrain — Checklist Go-Live

État : **code 100% prêt**. Le lancement n'attend que des éléments **externes**
(abonnements opérateurs + agrégateur USSD). Ce document liste exactement quoi
fournir et dans quel ordre lancer.

## 0. Acquis (déjà fait)
- ✅ Elastic IP **stable allouée** : `34.253.60.206` (`eipalloc-0a542b22195d5a7d3`) — **à whitelister chez MTN et Airtel**.
- ✅ Terraform validé (`plan` = 59 ressources, NAT lié à cette EIP).
- ✅ Migrations versionnées (`migrate deploy`) + image Docker durcie/allégée, validées en conteneur.
- ✅ Connecteurs MTN + Airtel : **Collection** (encaissement) ET **Disbursement** (reversement).
- ✅ 3 canaux client : lien/QR, app, USSD (code prêt).

## 1. Abonnements / credentials à obtenir (externe)
| Fournisseur | Produits à activer | Valeurs à récupérer |
|-------------|--------------------|---------------------|
| **MTN MoMo** | Collection + **Disbursement** | `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER_ID`, `MTN_API_KEY`, `MTN_DISBURSEMENT_SUBSCRIPTION_KEY`, `MTN_DISBURSEMENT_API_USER_ID`, `MTN_DISBURSEMENT_API_KEY` |
| **Airtel Money** | Collection + **Disbursement** (+ KYC, Balance optionnels) | `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AIRTEL_DISBURSEMENT_PIN` (PIN business chiffré RSA) |
| **Agrégateur USSD** | shortcode partagé MTN+Airtel, menu hébergé | `USSD_SHORTCODE`, IP passerelle (`USSD_GATEWAY_IP_ALLOWLIST`), callback `/ussd` |
| **Clerk** | instance **production** | `CLERK_SECRET_KEY` (`sk_live_…`), `VITE_CLERK_PUBLISHABLE_KEY` (`pk_live_…`) |
| **Smile Identity** | KYC | `SMILE_*` |
| **Screening sanctions/PEP** | AML | `SANCTIONS_API_URL`, `SANCTIONS_API_TOKEN` |
| **Postmark** (email) / **Africa's Talking** (SMS) | notifications | clés respectives |

> Whitelister **`34.253.60.206`** chez MTN et Airtel (Collection + Disbursement).

## 2. Secrets à générer nous-mêmes (neufs pour la prod)
`API_KEY_PEPPER` (≥32), `SETTLEMENT_VALIDATORS` (id:secret par validateur 4-eyes),
`JWT_SECRET`, `INTERNAL_API_TOKEN`, `MTN_WEBHOOK_SECRET`/`AIRTEL_WEBHOOK_SECRET`
(`openssl rand -hex 32`), `SMILE_WEBHOOK_SECRET`.

## 3. Séquence de lancement (le jour J)
1. `terraform apply -var-file=prod.tfvars` (crée VPC/NAT/RDS/ALB/ECS/WAF/Secrets).
2. **Remplir AWS Secrets Manager** avec les valeurs §1 et §2.
3. **Docker build → push ECR** (image déjà validée).
4. **Tâche de migration** ECS : `node dist/scripts/migrate.js` (= `migrate deploy`).
5. **Déployer le service ECS** + healthcheck `/health`.
6. **DNS + TLS** (ACM) + `ALLOWED_ORIGINS` = domaines front.
7. **Déployer les fronts** (dashboard, marketing, admin) avec leurs clés Clerk prod.
8. **Smoke tests** : health, paiement sandbox MTN+Airtel, reversement (disbursement), webhook signé, USSD.

## 4. Avant fonds réels (conformité)
Pen-test externe (ALP-146), société/PTSP/juridique, observabilité (Sentry/Grafana, ALP-123).

---
Réf. détaillée : `docs/DEPLOYMENT.md`. Mémoire : voir charte de sécurité.
