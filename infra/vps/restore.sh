#!/usr/bin/env sh
# Restauration d'une sauvegarde de backup.sh (procédure : docs/RUNBOOK.md).
#
#   infra/vps/restore.sh <base.dump.age> [<stockage.tar.age>]
#
# Par défaut, VÉRIFICATION sans risque : la base est restaurée dans une base à
# part (alphapay_restore_check) et comptée, la production n'est pas touchée.
# Restauration réelle (incident) : RESTORE_TARGET=production, services arrêtés.
#
# Variables :
#   AGE_IDENTITY     fichier de la clé PRIVÉE age (apportée pour l'occasion, jamais laissée sur le serveur)
#   ENV_FILE         défaut infra/vps/vps.env
#   RESTORE_TARGET   check (défaut) | production
set -eu

DB_ARCHIVE="${1:?usage : restore.sh <base.dump.age> [<stockage.tar.age>]}"
FILES_ARCHIVE="${2:-}"
: "${AGE_IDENTITY:?AGE_IDENTITY requis (clé privée age)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/vps/vps.env}"
TARGET="${RESTORE_TARGET:-check}"
compose() { docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ENV_FILE" "$@"; }
psql_() { compose exec -T postgres psql -U alphapay -v ON_ERROR_STOP=1 "$@"; }

case "$TARGET" in
  check) DB=alphapay_restore_check ;;
  production)
    DB=alphapay
    printf 'Restaurer PAR-DESSUS la base de production ? Taper « restaurer » : '
    read -r answer
    [ "$answer" = "restaurer" ] || { echo "abandon"; exit 1; }
    compose stop caddy api worker
    ;;
  *) echo "RESTORE_TARGET : check ou production" >&2; exit 2 ;;
esac

echo "[restauration] base -> $DB"
psql_ -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "CREATE DATABASE \"$DB\" OWNER alphapay"
age -d -i "$AGE_IDENTITY" "$DB_ARCHIVE" | compose exec -T postgres pg_restore -U alphapay -d "$DB" --no-owner --exit-on-error

# Contrôle : volumes des tables clés et dernière migration appliquée.
psql_ -d "$DB" -At -c "
  SELECT 'migrations', count(*) FROM _prisma_migrations UNION ALL
  SELECT 'marchands', count(*) FROM merchants UNION ALL
  SELECT 'paiements', count(*) FROM transactions UNION ALL
  SELECT 'factures', count(*) FROM invoices UNION ALL
  SELECT 'reçus', count(*) FROM receipts UNION ALL
  SELECT 'journal d''audit', count(*) FROM audit_logs;"

if [ -n "$FILES_ARCHIVE" ]; then
  if [ "$TARGET" = production ]; then
    echo "[restauration] fichiers -> volume de stockage"
    age -d -i "$AGE_IDENTITY" "$FILES_ARCHIVE" | compose run --rm -T --no-deps --entrypoint sh api -c 'tar -C /data/storage -xf -'
  else
    echo "[vérification] fichiers : $(age -d -i "$AGE_IDENTITY" "$FILES_ARCHIVE" | tar -tf - | grep -vc '/$') fichier(s) lisibles dans l'archive"
  fi
fi

if [ "$TARGET" = production ]; then
  compose up -d
  echo "restauration terminée : vérifier https://\$API_DOMAIN/ready et le tableau de bord"
else
  psql_ -d postgres -c "DROP DATABASE \"$DB\" WITH (FORCE)"
  echo "vérification OK : la sauvegarde se restaure (base de contrôle supprimée)"
fi
