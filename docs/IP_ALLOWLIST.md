# Allowlist d'IP des webhooks opérateur (ALP-160 / PAY-VULN-009)

Filtrage des IP sources autorisées à appeler les endpoints de webhook
(`POST /webhooks/mtn`, `POST /webhooks/airtel`). Couche défensive **en
complément** de la signature HMAC (ALP-158) — jamais en remplacement.

> ⚠️ La doc d'audit place ce fichier sous `securite/docs/IP_ALLOWLIST.md`. Ce
> dossier n'étant pas versionné dans ce dépôt, la procédure vit ici
> (`docs/IP_ALLOWLIST.md`) — emplacement committable et suivi en CI.

## Deux niveaux d'application

1. **WAF (autoritatif)** — Cloudflare ou AWS WAFv2 devant l'ALB. Bloque le
   trafic hors plages avant qu'il n'atteigne l'application. Voir
   [`terraform/waf.tf`](../terraform/waf.tf) (IaC, non appliquée tant que l'infra
   WAF n'est pas provisionnée — permissions AWS actuelles : Secrets/KMS/Logs).
2. **Application (défense en profondeur)** — `WebhookIpAllowlistGuard`. Actif
   seulement si `MTN_WEBHOOK_IP_ALLOWLIST` / `AIRTEL_WEBHOOK_IP_ALLOWLIST` sont
   définis (CSV d'IPv4 ou CIDR). No-op sinon (dev/sandbox). Une IP hors liste →
   `403` corps vide. Repose sur `trust proxy = 1` pour lire l'IP réelle derrière
   le LB.

## Plages IP MTN MoMo (à compléter via MTN)

> 🔴 **À RÉCUPÉRER auprès de MTN** (portail développeur / support partenaire).
> Les valeurs ci-dessous sont des **placeholders** — ne pas activer en prod tant
> qu'elles ne sont pas confirmées, sous peine de bloquer les vrais callbacks.

| Opérateur | Environnement | Plages (CIDR) | Source | Vérifié le |
|-----------|---------------|---------------|--------|------------|
| MTN MoMo  | sandbox       | _à fournir_   | MTN    | —          |
| MTN MoMo  | production    | _à fournir_   | MTN    | —          |
| Airtel    | production    | _à fournir_   | Airtel | —          |

## Procédure de mise à jour (les IP changent)

1. Obtenir la liste à jour auprès de MTN/Airtel (canal partenaire officiel).
2. Mettre à jour le tableau ci-dessus + la date de vérification.
3. Mettre à jour la variable Terraform `webhook_ip_allowlist_mtn` /
   `_airtel` puis `terraform apply` (met à jour l'`aws_wafv2_ip_set`).
4. Mettre à jour les secrets applicatifs `MTN_WEBHOOK_IP_ALLOWLIST` /
   `AIRTEL_WEBHOOK_IP_ALLOWLIST` (AWS Secrets Manager) pour la couche app.
5. Déployer en **staging d'abord**, vérifier qu'un vrai callback passe, puis prod.

## Faux positifs (vraie IP MTN bloquée)

- Le WAF logge chaque blocage (CloudWatch / Cloudflare Logs). Une alerte doit
  se déclencher si un blocage concerne un `User-Agent` MTN connu ou une requête
  portant une signature HMAC **valide** mais une IP hors liste → signe d'une
  plage MTN non documentée. Voir la métrique `BlockedWebhookValidHmac` (à câbler
  à la stack observabilité, ALP-123).
- Mitigation immédiate : retirer temporairement la règle WAF (HMAC reste la
  protection de fond) le temps de confirmer la nouvelle plage auprès de MTN.

## Tests

- Unitaire : `ip-allowlist.spec.ts` (match exact/CIDR/IPv4-mapped),
  `webhook-ip-allowlist.guard.spec.ts` (403 hors liste, no-op si non configuré).
- Bout-en-bout WAF : à exécuter en staging une fois la règle active
  (appel depuis IP hors plage → 403/forbidden au WAF, jamais atteint l'app).
