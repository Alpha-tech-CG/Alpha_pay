# Déploiement sur un VPS (OVH)

Stack : `docker-compose.prod.yml` — Caddy (TLS, tableau de bord et back-office
construits en statique, relais de l'API), API, worker (file de tâches), tâche de
migration, Postgres, Redis. Remplace le parcours AWS de `DEPLOYMENT.md` (le dossier
`terraform/` reste comme chemin de retour). Exploitation courante : `RUNBOOK.md`.

> État (31 oct. 2026) : pile démarrée sur un poste avec des domaines `*.localhost`
> (certificats locaux de Caddy) ; les deux parcours de bout en bout y passent, et
> sauvegarde puis restauration de contrôle ont été vérifiées. Pas encore déployée
> sur un VPS.

**Préproduction** : même procédure sur un second VPS, avec `infra/vps/preprod.env`
(copie de `vps.env.example` aux domaines de préproduction), des secrets propres et
`"DEPLOYMENT_ENV": "preproduction"` dans `app_env.json`. Remplacer `vps.env` par
`preprod.env` dans les commandes ci-dessous.

## 1. Préparer le serveur (une fois)

- VPS Linux (4 vCPU / 8 Go conseillé), Docker Engine + plugin compose.
- SSH par clé uniquement, pare-feu : seuls 22, 80 et 443 ouverts.
- Mises à jour de sécurité automatiques (`unattended-upgrades`).
- DNS : enregistrements A des quatre domaines (`API_DOMAIN`, `PAY_DOMAIN`,
  `DASHBOARD_DOMAIN`, `ADMIN_DOMAIN`) vers l'IP du VPS **avant** le premier démarrage.

## 2. Configuration

```bash
cp infra/vps/vps.env.example infra/vps/vps.env        # domaines, IP du back-office, email ACME
mkdir -p infra/vps/secrets && chmod 700 infra/vps/secrets
openssl rand -hex 32 > infra/vps/secrets/postgres_password
openssl rand -hex 32 > infra/vps/secrets/redis_password
cp infra/vps/app_env.example.json infra/vps/secrets/app_env.json   # puis remplir
chmod 444 infra/vps/secrets/*
```

- `app_env.json` est un objet JSON clé/valeur chargé au boot par `SECRETS_FILE`
  (même format que l'ancien secret AWS). Reporter les deux mots de passe générés
  dans `DATABASE_URL` et `REDIS_URL`.
- Les fichiers sont en lecture pour tous (444) car chaque conteneur les lit sous un
  utilisateur différent ; c'est le dossier `secrets/` en 700 (root) qui les protège
  sur l'hôte.
- Stockage des fichiers (pièces KYB chiffrées par l'API, exports, PDF) : par défaut
  le volume `api_storage`, partagé par l'API et le worker et sauvegardé par
  `backup.sh`. Variante OVH Object Storage : `STORAGE_DRIVER=s3`, `STORAGE_BUCKET`,
  `S3_ENDPOINT`, `S3_REGION` et les clés.
- `CHECKOUT_URL` = `https://<PAY_DOMAIN>`, `PUBLIC_API_URL` = `https://<API_DOMAIN>`,
  `ALLOWED_ORIGINS` = tableau de bord et back-office.

## 3. Démarrer

```bash
docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env up -d --build
docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env ps
curl https://$API_DOMAIN/health
```

L'ordre est imposé par le compose : Postgres → migrations → API et worker → Caddy.
Si `migrate` échoue, l'API ne démarre pas (`docker compose logs migrate`).
Ensuite : premier agent du back-office (`ADMIN.md`), puis la liste de `GO_LIVE.md`.

## 4. Mettre à jour

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env up -d --build
```

## 5. Sauvegardes

`infra/vps/backup.sh` (cron quotidien) : dump Postgres et archive du stockage,
chiffrés avec `age`, copie hors serveur vers Object Storage. Restauration et
vérification mensuelle : `infra/vps/restore.sh`, procédure dans `RUNBOOK.md` §4.

## Écarts connus par rapport à AWS

| Sujet | AWS | VPS |
|---|---|---|
| TLS Postgres | `verify-full` vers RDS | Aucun : Postgres n'est joignable que sur le réseau Docker interne du même hôte |
| Haute disponibilité | Multi-AZ | Aucune : une panne du VPS arrête le service |
| WAF | AWS WAF | Aucun (rate-limit applicatif + allowlists IP webhooks conservés) |
| IP sortante | `34.253.60.206` | IP du VPS — à communiquer aux opérateurs pour leur liste blanche |

## Non couvert

- Observabilité (`infra/docker-compose.observability.yml`) : à brancher sur le réseau
  `data` pour scraper `api:3000/metrics` avec `METRICS_TOKEN`.
