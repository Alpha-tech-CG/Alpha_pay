# Runbook d'exploitation AlphaPay

Pour l'installation initiale du serveur : [`DEPLOYMENT_VPS.md`](DEPLOYMENT_VPS.md).
Toutes les commandes se lancent depuis `/opt/alphapay` sur le VPS. Raccourci :

```bash
export ENV_FILE=infra/vps/vps.env          # préproduction : infra/vps/preprod.env
alias dc='docker compose -f docker-compose.prod.yml --env-file $ENV_FILE'
```

## 1. Environnements

| | Préproduction | Production |
|---|---|---|
| Serveur | VPS dédié (petit gabarit suffit) | VPS OVH (4 vCPU / 8 Go conseillé) |
| Fichier de domaines | `infra/vps/preprod.env` | `infra/vps/vps.env` |
| Secrets | `infra/vps/secrets/` propres, **valeurs différentes** | `infra/vps/secrets/` |
| `DEPLOYMENT_ENV` | `preproduction` (pages des fournisseurs factices, jeu de démo autorisé) | absent |
| Fournisseurs | factices ou sandbox | réels (voir `GO_LIVE.md`) |
| Domaines (exemple) | `api.preprod…`, `pay.preprod…`, `app.preprod…`, `admin.preprod…` | `api.alphapay.cg`, `pay.…`, `app.…`, `admin.…` |

Même image, même compose : seule la configuration change. La préproduction reçoit
chaque version avant la production ; les deux parcours de bout en bout doivent y
passer (section 3).

Services : `caddy` (TLS, tableau de bord, back-office, relais de l'API), `api`,
`worker` (file de tâches : statuts de paiement, messages, webhooks, exports,
relances), `migrate` (s'arrête après les migrations), `postgres`, `redis`.

## 2. Déployer une version

```bash
git fetch && git checkout <tag ou commit>
dc build                       # images alphapay-api et alphapay-web
dc up -d                       # migrations d'abord ; l'API ne démarre que si elles réussissent
dc ps                          # api et worker « healthy »
curl -fsS https://$API_DOMAIN/ready      # {"status":"ok","checks":{"database":"ok","redis":"ok"}}
dc logs --since 10m api worker | grep -i error
```

- Une migration en échec : `dc logs migrate`. L'ancienne API continue de tourner
  tant que la nouvelle ne démarre pas. Chaque migration a son `down.sql`
  (`packages/database/prisma/migrations/<n>/down.sql`), à appliquer à la main avec
  `dc exec -T postgres psql -U alphapay alphapay < down.sql` **après** une sauvegarde.
- Retour arrière applicatif : `git checkout <version précédente> && dc up -d --build`.

## 3. Recette en préproduction

```bash
cd apps/e2e
E2E_DASHBOARD_URL=https://app.preprod… E2E_API_URL=https://api.preprod… E2E_PAY_URL=https://pay.preprod… \
E2E_MAILHOG_URL=<boîte de test> E2E_STAFF_EMAIL=… E2E_STAFF_PASSWORD=… E2E_STAFF_TOTP_SECRET=… \
pnpm e2e
```

Sur un poste, la même recette tourne contre une copie locale de la pile de
production (domaines `*.localhost`, certificats locaux de Caddy) :

```bash
docker compose -p alphapay-recette -f docker-compose.prod.yml --env-file infra/vps/recette.env up -d --build
cd apps/e2e && NODE_OPTIONS="--require ./localhost-dns.cjs" E2E_CHANNEL=chrome E2E_IGNORE_HTTPS_ERRORS=1 \
  E2E_DASHBOARD_URL=https://app.localhost E2E_API_URL=https://api.localhost E2E_PAY_URL=https://pay.localhost \
  E2E_COMPOSE="-p alphapay-recette -f docker-compose.prod.yml --env-file infra/vps/recette.env" pnpm e2e
```

Jeu de démonstration en préproduction : `dc exec -e ALLOW_DEMO_SEED=true api node dist/scripts/demo-seed`.

## 4. Sauvegarde et restauration

**Sauvegarde** (cron quotidien, `infra/vps/backup.sh`) : dump Postgres et archive du
volume de stockage (pièces KYB, exports, PDF), chiffrés avec `age` vers une clé
publique, copiés vers OVH Object Storage, 14 jours gardés sur le serveur.

```bash
# /etc/cron.d/alphapay-backup
15 2 * * * root AGE_RECIPIENT=age1… BACKUP_S3_URI=s3://alphapay-prod-backups S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net /opt/alphapay/infra/vps/backup.sh >> /var/log/alphapay-backup.log 2>&1
```

La clé **privée** `age` ne vit jamais sur le serveur : elle est conservée hors ligne
par deux personnes d'AlphaPay.

**Vérification de restauration** (mensuelle, et après tout changement de schéma) :
restaure dans une base à part, compte les tables clés, vérifie l'archive des fichiers,
puis supprime la base de contrôle. La production n'est pas touchée.

```bash
AGE_IDENTITY=/chemin/cle-privee.txt infra/vps/restore.sh /var/backups/alphapay/alphapay-<date>.dump.age /var/backups/alphapay/alphapay-<date>.storage.tar.age
```

Testée le 31 octobre 2026 sur la pile de production locale : 33 migrations,
marchands, paiements, factures, reçus et journal d'audit restaurés, 6 fichiers lus.

**Restauration réelle** (perte de données, serveur reconstruit) : arrête Caddy,
l'API et le worker, remplace la base et le stockage, redémarre.

```bash
RESTORE_TARGET=production AGE_IDENTITY=… infra/vps/restore.sh <base.dump.age> <stockage.tar.age>
```

Ensuite : `/ready`, connexion au tableau de bord, un paiement de test, et prévenir
les marchands si des paiements ont eu lieu entre la sauvegarde et l'incident (ils
sont sur leurs relevés opérateur ; les statuts se retrouvent par la relance des statuts).

## 5. Rotation des secrets

Les secrets vivent dans `infra/vps/secrets/app_env.json` (lecture au démarrage).
Après modification : `dc up -d --force-recreate api worker`.

| Secret | Rotation | Effet |
|---|---|---|
| `JWT_SECRET` | libre | Jetons d'accès invalidés : les utilisateurs se reconnectent |
| `OTP_HMAC_SECRET` | libre | Codes en cours (5 min) invalidés |
| `INTERNAL_API_TOKEN`, `METRICS_TOKEN` | libre | Mettre à jour Prometheus |
| `MESSAGING_WEBHOOK_TOKEN` | libre | Mettre à jour l'URL d'accusés chez Infobip |
| Mots de passe Postgres et Redis | libre | Modifier le fichier `secrets/…_password` **et** `DATABASE_URL` / `REDIS_URL`, puis `dc up -d --force-recreate` |
| Clés des fournisseurs (Infobip, Meta, SMTP, Sumsub) | libre | Générer la nouvelle chez le fournisseur, l'installer, révoquer l'ancienne |
| Clés API des marchands | par le marchand | **Développeurs → Clés API → Remplacer** (l'ancienne est révoquée) |
| `CALLBACK_SIGNING_SECRET` | avec précaution | Change les URL de callback des opérateurs et les liens publics des reçus et factures déjà envoyés. Les paiements restent suivis par la relance des statuts. |
| `API_KEY_PEPPER` | **non** | Invaliderait toutes les clés API des marchands |
| `PII_ENCRYPTION_KEY`, `PROVIDER_CREDENTIALS_KEY`, `DOCUMENTS_ENCRYPTION_KEY` | **non en V1** | Les données chiffrées deviendraient illisibles : la rotation demande un rechiffrement (clés versionnées), prévu après la V1. En cas de fuite : traiter comme un incident majeur. |

## 6. Incident opérateur (MTN ou Airtel)

Symptômes : taux d'échec qui monte (back-office → Supervision, « paiements en échec
par opérateur »), paiements qui restent `en_attente`, `dc logs worker | grep -i mtn`.

1. Confirmer : un paiement de test sur un compte de test, statut de la plateforme de l'opérateur.
2. Les paiements en attente ne sont **ni perdus ni doublés** : le worker relit leur
   statut à intervalles croissants jusqu'au statut final ou l'expiration
   (`PAYMENT_EXPIRY_SECONDS`). Rien à rejouer à la main.
3. Si l'opérateur refuse les identifiants d'un seul marchand (401/403) : le marchand
   vérifie puis refait sa connexion dans **Comptes opérateur** (le bouton
   « Vérifier » contrôle les identifiants auprès de l'opérateur).
4. Panne longue : prévenir les marchands concernés, qui orientent leurs clients vers
   l'autre opérateur.
5. Après retour : vérifier que les paiements `en_attente` se résolvent, puis le taux d'échec.

Callbacks refusés (IP non autorisée) : mettre à jour `MTN_WEBHOOK_IP_ALLOWLIST` /
`AIRTEL_WEBHOOK_IP_ALLOWLIST` avec les plages communiquées par l'opérateur.

## 7. Incident fournisseur de messages (SMS, WhatsApp, email)

Symptômes : back-office → Supervision, « messages en échec par fournisseur » ; codes
de connexion non reçus.

1. La **bascule de canal** joue d'elle-même : un WhatsApp en échec part en SMS, et
   les nouvelles tentatives couvrent les erreurs réseau, 5xx et 429.
2. Panne d'un fournisseur : passer le canal en secours. Exemple, Infobip en panne :
   les utilisateurs choisissent WhatsApp ou email pour leur code (écran de connexion).
   Couper un fournisseur fautif : `SMS_PROVIDER=mock` **uniquement en préproduction** ;
   en production, contacter le fournisseur.
3. Crédits : un message non parti est remboursé au marchand (registre de crédits).
4. Modèle WhatsApp refusé par Meta : les envois basculent en SMS ; resoumettre le modèle.
5. Vérifier ensuite les messages en échec dans le journal (destination masquée, statut).

## 8. Surveillance courante

- `/ready` (base et Redis) toutes les minutes depuis une sonde externe.
- `/metrics` (réseau interne, jeton `METRICS_TOKEN`) : paiements par statut et
  opérateur, messages par statut et fournisseur, webhooks en échec, durée des tâches.
- Erreurs applicatives : Sentry (`SENTRY_DSN`).
- Disque : volumes `postgres_data` et `api_storage`, dossier des sauvegardes.

## 9. Tests d'intégration sur le poste de développement

La redirection de ports de Docker Desktop vers Postgres perd des connexions sous
charge sur certains postes Windows. Lancer la suite dans un conteneur sur le réseau
Docker :

```bash
docker build --target builder -t alphapay-api-inttest -f apps/api/Dockerfile .
docker run --rm --network alphapay-local_default \
  -e TEST_DATABASE_URL=postgresql://alphapay:alphapay@postgres:5432/alphapay_test \
  -w /app/apps/api alphapay-api-inttest npx jest --config test/jest-integration.json
```
