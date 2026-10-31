#!/usr/bin/env sh
# Sauvegarde quotidienne : base Postgres ET stockage des fichiers (pièces KYB
# chiffrées, exports, PDF), chiffrés avec age, copie hors serveur.
# Cron (root) :  15 2 * * *  /opt/alphapay/infra/vps/backup.sh >> /var/log/alphapay-backup.log 2>&1
# Restauration : infra/vps/restore.sh (procédure dans docs/RUNBOOK.md).
#
# Variables requises :
#   AGE_RECIPIENT     clé PUBLIQUE age (la clé privée ne doit PAS être sur le serveur)
# Variables optionnelles :
#   ENV_FILE          défaut infra/vps/vps.env (préproduction : infra/vps/preprod.env)
#   BACKUP_S3_URI     copie hors serveur, ex. s3://alphapay-prod-backups/postgres
#   S3_ENDPOINT       ex. https://s3.gra.io.cloud.ovh.net
#   BACKUP_DIR        défaut /var/backups/alphapay
#   RETENTION_DAYS    défaut 14 (copies locales)
set -eu

: "${AGE_RECIPIENT:?AGE_RECIPIENT requis}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/vps/vps.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/alphapay}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_FILE="$BACKUP_DIR/alphapay-$STAMP.dump.age"
FILES_FILE="$BACKUP_DIR/alphapay-$STAMP.storage.tar.age"
compose() { docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ENV_FILE" "$@"; }

umask 077
mkdir -p "$BACKUP_DIR"

compose exec -T postgres pg_dump -U alphapay -Fc alphapay | age -r "$AGE_RECIPIENT" -o "$DB_FILE.tmp"
compose exec -T api tar -C /data/storage -cf - . | age -r "$AGE_RECIPIENT" -o "$FILES_FILE.tmp"

# Une sauvegarde vide ou tronquée ne doit jamais remplacer une sauvegarde valide.
for f in "$DB_FILE" "$FILES_FILE"; do
  [ -s "$f.tmp" ] || { echo "sauvegarde vide : $f" >&2; rm -f "$DB_FILE.tmp" "$FILES_FILE.tmp"; exit 1; }
done
mv "$DB_FILE.tmp" "$DB_FILE"
mv "$FILES_FILE.tmp" "$FILES_FILE"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  for f in "$DB_FILE" "$FILES_FILE"; do
    aws s3 cp "$f" "$BACKUP_S3_URI/" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
  done
fi

find "$BACKUP_DIR" -name 'alphapay-*.age' -mtime +"$RETENTION_DAYS" -delete
echo "sauvegarde OK : $DB_FILE $FILES_FILE"
