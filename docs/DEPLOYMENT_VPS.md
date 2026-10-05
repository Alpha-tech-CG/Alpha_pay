# Déploiement sur un VPS (OVH)

Stack : `docker-compose.prod.yml` — Caddy (TLS), API, tâche de migration, Postgres, Redis.
Remplace le parcours AWS de `DEPLOYMENT.md` (le dossier `terraform/` reste comme chemin de retour).

> État : configuration validée en syntaxe (`docker compose config`), **jamais encore
> démarrée** — Docker était indisponible sur le poste de dev. Le premier `up` est à
> faire en local avant le VPS.

## 1. Préparer le serveur (une fois)

- VPS Linux (4 vCPU / 8 Go conseillé), Docker Engine + plugin compose.
- SSH par clé uniquement, pare-feu : seuls 22, 80 et 443 ouverts.
- Mises à jour de sécurité automatiques (`unattended-upgrades`).
- DNS : enregistrement A de `API_DOMAIN` vers l'IP du VPS **avant** le premier démarrage.

## 2. Configuration

```bash
cp infra/vps/vps.env.example infra/vps/vps.env        # domaine + email ACME
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
- Stockage de documents : créer les buckets sur OVH Object Storage et renseigner
  `S3_ENDPOINT`, `S3_REGION`, les clés et les noms de buckets. À vérifier chez OVH
  avant fonds réels : le chiffrement côté serveur (`AES256`, exigé par le contrôle
  KYC) et l'Object Lock (rétention 5 ans des rapports de réconciliation).

## 3. Démarrer

```bash
docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env up -d --build
docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env ps
curl https://$API_DOMAIN/health
```

L'ordre est imposé par le compose : Postgres → migrations → API → Caddy.
Si `migrate` échoue, l'API ne démarre pas (`docker compose logs migrate`).

## 4. Mettre à jour

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env up -d --build
```

## 5. Sauvegardes

`infra/vps/backup.sh` (cron quotidien) : dump Postgres chiffré avec `age`, copie
hors serveur vers Object Storage. **Tester une restauration** avant tout fonds réel.

## Écarts connus par rapport à AWS

| Sujet | AWS | VPS |
|---|---|---|
| TLS Postgres | `verify-full` vers RDS | Aucun : Postgres n'est joignable que sur le réseau Docker interne du même hôte |
| Haute disponibilité | Multi-AZ | Aucune : une panne du VPS arrête le service |
| WAF | AWS WAF | Aucun (rate-limit applicatif + allowlists IP webhooks conservés) |
| IP sortante | `34.253.60.206` | IP du VPS — à communiquer aux opérateurs pour leur liste blanche |

## Non couvert

- Dashboard marchand et back-office admin : en dev, c'est le proxy Vite qui injecte
  la clé API / le jeton interne côté serveur. Il n'existe pas encore d'équivalent
  de production (BFF) ; ne pas les exposer tels quels.
- Observabilité (`infra/docker-compose.observability.yml`) : à brancher sur le réseau
  `data` pour scraper `api:3000/metrics` avec `METRICS_TOKEN`.
