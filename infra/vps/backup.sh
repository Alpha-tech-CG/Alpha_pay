#!/usr/bin/env sh
# Sauvegarde quotidienne de Postgres — dump chiffré avec age, copie hors serveur.
# Cron (root) :  15 2 * * *  /opt/alphapay/infra/vps/backup.sh >> /var/log/alphapay-backup.log 2>&1
#
# Variables requises :
#   AGE_RECIPIENT     clé PUBLIQUE age (la clé privée ne doit PAS être sur le serveur)
# Variables optionnelles (copie hors serveur, stockage compatible S3) :
#   BACKUP_S3_URI     ex. s3://alphapay-prod-backups/postgres
#   S3_ENDPOINT       ex. https://s3.gra.io.cloud.ovh.net
#   BACKUP_DIR        défaut /var/backups/alphapay
#   RETENTION_DAYS    défaut 14 (copies locales)
set -eu

: "${AGE_RECIPIENT:?AGE_RECIPIENT requis}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/alphapay}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FILE="$BACKUP_DIR/alphapay-$(date -u +%Y%m%dT%H%M%SZ).dump.age"

umask 077
mkdir -p "$BACKUP_DIR"

docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ROOT/infra/vps/vps.env" \
  exec -T postgres pg_dump -U alphapay -Fc alphapay \
  | age -r "$AGE_RECIPIENT" -o "$FILE.tmp"

# Un dump vide ou tronqué ne doit jamais remplacer une sauvegarde valide.
[ -s "$FILE.tmp" ] || { echo "dump vide" >&2; rm -f "$FILE.tmp"; exit 1; }
mv "$FILE.tmp" "$FILE"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp "$FILE" "$BACKUP_S3_URI/" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
fi

find "$BACKUP_DIR" -name 'alphapay-*.dump.age' -mtime +"$RETENTION_DAYS" -delete
echo "sauvegarde OK : $FILE"
