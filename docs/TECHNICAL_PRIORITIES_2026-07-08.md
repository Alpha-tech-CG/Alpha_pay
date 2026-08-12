# PayBrain - Technical Priorities Update

Date: 2026-07-08

## Resolved

- Security fail-closed defaults:
  - Operator wallet callbacks now require HMAC secrets by default.
  - Unsigned operator callbacks require explicit local/sandbox override.
  - Metrics are closed in production when `METRICS_TOKEN` is missing.
  - Operator webhook IP allowlists are mandatory in production.
  - Admin proxy no longer has a hard-coded internal token fallback.

- Financial serialization:
  - API `BigInt` values are serialized as decimal strings, avoiding silent JS precision loss.

- CI/CD:
  - GitHub Actions deploy workflow uses AWS OIDC via `AWS_DEPLOY_ROLE_ARN`.
  - Terraform can create the deploy role when `github_repository` is configured.
  - Failed migration tasks restore the previous ECS service capacity.

- Observability:
  - Prometheus alert rules added in `infra/prometheus/alerts/paybrain-alerts.yml`.
  - Alerts cover wallet float drift, PIN brute-force spikes, API scrape failure, and webhook HMAC failures.

## Required Configuration Before Production

- Set `METRICS_TOKEN` in Secrets Manager and configure Prometheus scraping with the matching bearer token.
- Set `MTN_WEBHOOK_IP_ALLOWLIST` and `AIRTEL_WEBHOOK_IP_ALLOWLIST`.
- Set `github_repository = "owner/repo"` in the production Terraform vars.
- Copy Terraform output `github_actions_deploy_role_arn` into GitHub secret `AWS_DEPLOY_ROLE_ARN`.
- Provide a non-empty `acm_certificate_arn` in prod.

## Still Open

- Run `terraform fmt` and `terraform validate` in an environment where Terraform is installed.
- Move toward zero-downtime DB migrations by requiring backward-compatible expand/contract migrations.
- Add full e2e tests for payment -> webhook -> ledger -> settlement once testcontainers or a stable test DB harness is available.
