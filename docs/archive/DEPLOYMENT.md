# Runbook de déploiement — PayBrain (Phase 1 → prod, puis Phase 2)

Procédure pas à pas pour déployer l'infrastructure, finaliser les tickets Phase 1
encore « In Progress » (bloqués sur l'infra/externe) et préparer la Phase 2.

> Convention : 🟦 = à faire dans la console/CLI AWS · 🟩 = commande locale ·
> ⚠️ = point sensible (argent, sécurité, irréversible).

---

## 0. Pré-requis (une fois)

| Outil | Vérif |
|-------|-------|
| AWS CLI v2 | `aws --version` |
| Terraform ≥ 1.5 | `terraform version` |
| Docker | `docker version` (à installer — absent en dev local) |
| Node 20+ / npm | `node -v` |

🟦 **Étendre les permissions IAM du déployeur.** L'utilisateur actuel
`paybrain-terraform-deployer` n'a que `SecretsManager/KMS/CloudWatch`. Pour le
`terraform apply` complet il faut, le temps du déploiement, attacher
`AdministratorAccess` (puis le restreindre après le premier apply), ou a minima :
`AmazonVPCFullAccess`, `AmazonECS_FullAccess`, `AmazonRDSFullAccess`,
`AmazonEC2ContainerRegistryFullAccess`, `IAMFullAccess`, `AmazonS3FullAccess`,
`AWSWAFv2FullAccess`, `CloudWatchLogsFullAccess`, `SecretsManagerReadWrite`.

---

## 1. Backend Terraform (S3) — ALP-122

🟦 Créer le bucket d'état (région `eu-west-1`, déclaré dans `terraform/main.tf`) :
```bash
aws s3 mb s3://paybrain-terraform-state --region eu-west-1 --profile paybrain
aws s3api put-bucket-versioning --bucket paybrain-terraform-state \
  --versioning-configuration Status=Enabled --profile paybrain
```

---

## 2. Provisionner l'infra cœur (VPC, RDS, ECS, ECR, Secrets) — ALP-122 / ALP-139

🟩 Depuis `terraform/` :
```bash
cd terraform
cp prod.tfvars.example prod.tfvars
terraform init -reconfigure -backend-config=backends/prod.hcl
# Variables sensibles (ne pas committer) : db_username, db_password,
# db_rotation_lambda_arn (ARN SAR), webhook_ip_allowlist_mtn/airtel.
terraform plan  -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars   # ⚠️ crée RDS Multi-AZ + NAT Gateway (coûts AWS)
```
Sortants utiles : ARN ECR, endpoint RDS, ARNs Secrets Manager, IAM role ECS task.

Pour `dev` ou `staging`, utiliser le couple correspondant
`backends/<env>.hcl` + `<env>.tfvars.example`. Les noms AWS, le state, le VPC,
RDS, ECS et les secrets sont isolés par environnement.

> Rotation auto 30 j des creds DB : déployer d'abord l'app SAR
> `SecretsManagerRDSPostgreSQLRotationSingleUser`, puis passer son ARN dans
> `db_rotation_lambda_arn`.

---

## 3. Remplir les secrets (Secrets Manager) — ALP-139 / ALP-163

🟦 Pour chaque secret créé par Terraform (`paybrain/prod/db-credentials`,
`jwt-pepper`, `connector-hmac-secrets`, `clerk-keys`, `sms-email-keys`) :
```bash
aws secretsmanager put-secret-value --secret-id paybrain/prod/jwt-pepper \
  --secret-string "$(openssl rand -base64 48)" --profile paybrain
```
Générer aussi : `API_KEY_PEPPER` (≥32), `PII_ENCRYPTION_KEY` (base64 32 octets,
KEK du chiffrement PII ALP-164), `MTN_WEBHOOK_SECRET`/`AIRTEL_WEBHOOK_SECRET`
(`openssl rand -hex 32`).
⚠️ **Roter** tous les secrets sandbox actuels chez les fournisseurs (MTN, Clerk).

🟦 **Secret d'environnement applicatif** : l'app charge au boot **un seul** secret
JSON via `loadSecretsFromAws()` — le secret `paybrain/<env>/env` créé par Terraform.
Le remplir avec toutes les variables (DATABASE_URL en verify-full, MTN_*, JWT_SECRET,
API_KEY_PEPPER, PII_ENCRYPTION_KEY, MTN_WEBHOOK_SECRET, ALLOWED_ORIGINS, …) :
```bash
aws secretsmanager put-secret-value --secret-id paybrain/prod/env \
  --secret-string file://prod-env.json --profile paybrain --region eu-west-1
```
La task ECS reçoit `AWS_SECRETS_MANAGER_SECRET_ID` pointant vers ce secret.

---

## 4. Construire et pousser l'image API (ECR)

🟩 (`apps/api/Dockerfile` embarque déjà le CA bundle RDS pour le TLS verify-full,
ALP-165) :
```bash
aws ecr get-login-password --region eu-west-1 --profile paybrain \
  | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.eu-west-1.amazonaws.com
docker build -t paybrain-api -f apps/api/Dockerfile .
docker tag paybrain-api:latest <ACCOUNT>.dkr.ecr.eu-west-1.amazonaws.com/paybrain-prod-api:latest
docker push <ACCOUNT>.dkr.ecr.eu-west-1.amazonaws.com/paybrain-prod-api:latest
```

---

## 5. Base de données : schéma + immutabilité ledger

Le pipeline de production ouvre une courte fenêtre de maintenance : il ramène
le service à zéro tâche, exécute `dist/scripts/migrate` dans une tâche ECS
ponctuelle, déploie la nouvelle définition puis restaure la capacité initiale.
Un échec de `prisma migrate deploy` (schéma ou triggers) bloque le déploiement
et laisse le service arrêté pour éviter de relancer une ancienne version sur un
schéma partiellement migré.

🟩 Avec le `DATABASE_URL` prod (TLS verify-full — cf. `docs/DB_TLS.md`) :
```bash
# Schéma complet + immutabilité ledger (triggers anti-UPDATE/DELETE + vue
# account_balances) en UNE commande — migrations versionnées dans
# packages/database/prisma/migrations/ (0_init, 1_ledger_immutability).
DATABASE_URL="postgresql://USER:PASS@HOST:5432/paybrain?sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca-bundle.pem" \
  npm run db:migrate --workspace @paybrain/database   # = prisma migrate deploy
```

> Reprise d'une ANCIENNE base (pré-centimes / email en clair) uniquement — **pas
> pour une base neuve** : lancer d'abord les scripts de migration de données
> `db:ledger-cents` puis `db:merchant-email` (avec `PII_ENCRYPTION_KEY`) avant
> `migrate deploy`.

---

## 6. Service ECS Fargate + ALB — ALP-122

✅ **Déjà dans le Terraform** (`terraform/ecs.tf`) : ALB public, target group
(health check `/health`), task definition Fargate (image ECR, logs CloudWatch),
service ECS (2 tâches), rôle d'exécution, association WAF→ALB. Donc le
`terraform apply` de l'étape 2 monte **tout**, y compris l'API en ligne.

🟩 Après le 1ᵉʳ apply, forcer un déploiement avec l'image fraîchement poussée :
```bash
aws ecs update-service --cluster paybrain-prod-cluster --service paybrain-prod-api \
  --force-new-deployment --profile paybrain --region eu-west-1
```
L'URL publique est dans l'output Terraform `alb_dns_name` (à pointer en CNAME
depuis `api.paybrain.cg`). Le listener est en HTTP tant que `acm_certificate_arn`
est vide ; fournir le certificat ACM active le HTTPS + la redirection 80→443.

---

## 7. WAF — allowlist IP webhooks — ALP-160

🟦 Récupérer les **vraies plages IP MTN/Airtel** (canal partenaire) → les mettre
dans `webhook_ip_allowlist_mtn/airtel` puis :
```bash
terraform apply -var-file=prod.tfvars   # applique terraform/waf.tf (IP set + Web ACL)
```
Le Web ACL est associé à l'ALB par `terraform/ecs.tf`.
Définir aussi `MTN_WEBHOOK_IP_ALLOWLIST`/`AIRTEL_WEBHOOK_IP_ALLOWLIST` (couche app).

---

## 8. DNS + TLS

🟦 `api.paybrain.cg` → ALB (certificat ACM), `app.paybrain.cg` (dashboard),
`paybrain.cg` (marketing). Mettre `ALLOWED_ORIGINS` (ALP-155) =
`https://app.paybrain.cg,https://paybrain.cg`.

---

## 9. Dashboard + Site marketing — ALP-134 / ALP-133

🟦 **Dashboard** (Vite) : build statique → Cloudflare Pages / S3+CloudFront.
Variables : `VITE_CLERK_PUBLISHABLE_KEY`. Clerk : passer l'instance en
**production** (clés `pk_live_…`).
🟦 **Marketing** (Next.js) : `apps/marketing` → Vercel ou Cloudflare Pages.
Variables : `DATABASE_URL` (waitlist/contact), `NEXT_PUBLIC_POSTHOG_KEY` +
`NEXT_PUBLIC_POSTHOG_HOST` (provisionner l'instance PostHog auto-hébergée).
Lancer un audit **Lighthouse** (objectif > 90).

---

## 10. SDK TypeScript — ALP-138

🟩 Publier le client sur npm (org `@paybrain`) :
```bash
cd packages/sdk && npm run build && npm publish --access public
```
🟦 Héberger la doc : importer `https://api.paybrain.cg/docs/openapi.json` dans
Scalar/Mintlify, ou exposer `/reference` (déjà servi par l'API).

---

## 11. Observabilité — ALP-123 (Phase 0)

🟦 Sentry (DSN backend + Next.js), Grafana Cloud + Loki (logs JSON), Prometheus
(Container Insights), Better Stack (uptime sur `/health`). Câbler l'alerte
« webhook valide HMAC mais IP hors liste » (faux positif WAF, cf.
`docs/IP_ALLOWLIST.md`) et l'alerte email d'échec webhook (accroche déjà posée
dans `WebhookDeliveryService`, branchera ALP-143).

---

## 12. Vérification post-déploiement (smoke tests prod)

- `GET https://api.paybrain.cg/health` → 200
- `GET /docs` et `/reference` → portails servis
- `POST /payments` (clé live + Idempotency-Key) → transaction créée, PII chiffrée
- Webhook signé → 200 ; non signé → 401 ; IP hors plage → bloqué WAF
- `GET /internal/ledger/verify` → `{ valid: true }`
- Dashboard : login Clerk, transactions visibles (montants en unités majeures)
- Marketing : `/fr` et `/en`, waitlist → ligne en DB, `sitemap.xml`/`robots.txt`

---

## 13. Clôturer la Phase 1 et passer à la Phase 2

Une fois déployé, repasser en **Done** dans Linear les tickets dont le seul reste
était l'infra : ALP-122 (Phase 0), ALP-123 (Phase 0). ALP-133/138/160/139 sont
déjà Done côté code ; ajouter un commentaire « déployé en prod le <date> ».

**Phase 2 — Pilote** (par priorité) :
1. ALP-140 — Moteur de réconciliation (cron + à la demande)
2. ALP-141 — Settlement / payout engine
3. ALP-142 — KYC pipeline (Smile Identity)
4. ALP-143 — Notifications SMS (Africa's Talking) + email (Postmark)
5. ALP-144 — Back-office admin (RBAC, IP allowlist)
6. ALP-145 — Onboarder 5–10 marchands pilotes (ops)
7. ALP-146 — Audit sécurité externe (pen test) avant fonds réels
